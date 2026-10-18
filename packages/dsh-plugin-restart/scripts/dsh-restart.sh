#!/usr/bin/env bash
# ============================================================================
# ⚠️  dsh-restart.sh  —  MUST BE RUN FROM AN EXTERNAL SHELL, NOT INSIDE DSH  ⚠️
# ============================================================================
# This script restarts the DSH web process by killing it and starting a new
# one. If you run it from inside a DSH session (Agent bash tool), it kills the
# very process executing the command before the tool result is durably saved,
# which leaves the conversation stuck / unresponsive.
#
# Correct usage:
#   1. In a normal terminal OUTSIDE DSH, from the dsh-pouch repo root:
#        bash packages/dsh-plugin-restart/scripts/dsh-restart.sh       # prod
#        bash packages/dsh-plugin-restart/scripts/dsh-restart.sh dev   # dev
#   2. From inside DSH, use the safe interfaces instead:
#        /dsh-restart                     (command, fixed 3s delay)
#        dsh_restart                      (agent tool, fixed 3s delay)
#   3. If you are inside DSH but must call this script directly, strip the
#      DSH shell marker so it runs as an external command (add a delay so the
#      tool result can be saved first):
#        env -u DSH_SHELL DSH_RESTART_ALLOWED=1 \
#          bash packages/dsh-plugin-restart/scripts/dsh-restart.sh --delay 3000
#
# The first invocation spawns a detached worker (setsid + nohup) and returns
# immediately. The worker performs the kill/start sequence and writes progress
# to ~/.dsh/dsh-restart.log (prod) or ~/.dsh-dev/dsh-restart.log (dev).
#
# If the new DSH process dies during startup, or never becomes ready within
# 30s, the worker starts a detached single-file error page service
# (dsh-restart-error-server.js) on the target port, so refreshing the browser
# tab shows a real failure report (reason + log tails) instead of a bare
# connection error. That service always exits by itself: its retry button
# first kills it (releasing the port) before rerunning this script, and it
# quits immediately if the port is taken by something else — so it can never
# block a later manual DSH start. Its state file is
# $PROFILE_HOME/restart-failed.json; a successful restart removes it.
#
# Usage:
#   dsh-restart.sh                     # ~/.dsh on port 3080 (dsh --profile web)
#   dsh-restart.sh dev                 # dev: ~/.dsh-dev, dsh web --port 18888
#   dsh-restart.sh --port 8080         # the default home on another port
#   dsh-restart.sh --profile-home DIR  # an instance whose DSH_HOME is DIR
#   dsh-restart.sh --explain           # print environment/usage guidance and exit
#
# The target instance is chosen by --profile-home, then DSH_HOME, then the mode
# default; the plugin always passes --profile-home so the instance that asked
# for the restart is the one restarted.
# ============================================================================
set -euo pipefail

# --explain: print the guidance embedded above and exit without doing anything.
# The banner is the whole comment block between the shebang line and the first
# `set` statement, so it stays complete when the block grows.
if [[ "${1:-}" == "--explain" ]]; then
  end="$(grep -n -m1 '^set -' "$0" | cut -d: -f1)"
  sed -n "2,$((end - 2))p" "$0"
  exit 0
fi

# Refuse to run the restart launcher directly from inside a DSH shell.
# A direct bash tool call would kill the very DSH process that is executing
# this command before the tool result is durably recorded, leaving the
# conversation stuck with an unresolved tool call in the UI.
# The /dsh-restart command and dsh_restart tool schedule a detached helper
# with DSH_RESTART_ALLOWED=1, so they are still permitted.
if [[ "${DSH_RESTART_ALLOWED:-}" != "1" && -n "${DSH_SHELL:-}" ]]; then
  echo "error: refusing to restart DSH from inside a DSH session" >&2
  echo >&2
  echo "This script must run in an EXTERNAL shell. Inside DSH, use:" >&2
  echo "  /dsh-restart          (command, fixed 3s delay)" >&2
  echo "  dsh_restart           (agent tool, fixed 3s delay)" >&2
  echo >&2
  echo "If you intentionally want to call this script from the current bash" >&2
  echo "tool, strip the DSH marker and allow it (add a delay so the tool" >&2
  echo "result is saved before DSH restarts):" >&2
  echo "  env -u DSH_SHELL DSH_RESTART_ALLOWED=1 \\" >&2
  echo "    bash '$0' --delay 3000" >&2
  echo >&2
  echo "Run 'bash $0 --explain' for the full usage banner." >&2
  exit 1
fi

# --- argument parsing (shared by launcher and worker) ------------------------
# The launcher needs PROFILE_HOME before it can decide where the worker log
# lives, and the worker is re-executed with the same argv, so both parse here
# rather than each keeping its own copy. ORIG_ARGS is captured first: the loop
# below shifts the positional parameters away, and the launcher re-exec must
# still see the caller's full argv.
ORIG_ARGS=("$@")
DELAY_MS=0
MODE="prod"
PORT_ARG=""
PROFILE_HOME_ARG=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --delay)
      DELAY_MS="${2:-0}"
      shift 2
      ;;
    --port)
      PORT_ARG="${2:-}"
      shift 2
      ;;
    --profile-home)
      PROFILE_HOME_ARG="${2:-}"
      shift 2
      ;;
    dev)
      MODE="dev"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Which DSH home this restart targets. An explicit --profile-home wins, then
# the DSH_HOME of the calling instance, then the mode default. Reading only the
# mode default would restart ~/.dsh whenever an instance ran on any other home.
if [[ -n "$PROFILE_HOME_ARG" ]]; then
  PROFILE_HOME="$PROFILE_HOME_ARG"
elif [[ -n "${DSH_HOME:-}" ]]; then
  PROFILE_HOME="$DSH_HOME"
elif [[ "$MODE" == "dev" ]]; then
  PROFILE_HOME="$HOME/.dsh-dev"
else
  PROFILE_HOME="$HOME/.dsh"
fi
PROFILE_HOME="${PROFILE_HOME%/}"

if [[ "${DSH_RESTART_DETACHED:-}" != "1" ]]; then
  # --- launcher mode: re-exec self as a detached worker and return ---
  LOG="$PROFILE_HOME/dsh-restart.log"
  mkdir -p "$PROFILE_HOME"
  : > "$LOG"
  nohup setsid env DSH_RESTART_DETACHED=1 bash "$0" "${ORIG_ARGS[@]}" >>"$LOG" 2>&1 < /dev/null &
  echo "dsh-restart worker launched (pid $!), see $LOG"
  exit 0
fi

# --- worker mode: this process is already detached, do the real work ---
PROFILE_DIR="$PROFILE_HOME/profiles/web"
if [[ "$MODE" == "dev" ]]; then
  EXTRA_ARGS=(--port 18888)
  PORT=18888
else
  PORT=3080
  if [[ -n "$PORT_ARG" ]]; then
    PORT="$PORT_ARG"
    EXTRA_ARGS=(--port "$PORT_ARG")
  fi
fi

if [[ "$DELAY_MS" -gt 0 ]]; then
  echo "waiting ${DELAY_MS}ms before restart"
  sleep "$(awk "BEGIN { print $DELAY_MS / 1000 }")"
fi

# --- failure fallback: make the failure visible in the browser --------------
# When the new DSH process dies or never becomes ready, DSH and all plugin
# code are already gone; the only survivor is this detached bash chain, so the
# error page can only be served from here. See dsh-restart-error-server.js.
serve_error_page_and_fail() {
  local reason="$1"
  local cfg="$PROFILE_HOME/restart-failed.json"
  # Reconstruct the argv that reproduces this exact restart, including the home
  # it targeted: the retry button must restart the same instance, not the mode
  # default (which is a different instance whenever --profile-home was used).
  local args_json="[" sep=""
  append_arg_json() {
    args_json+="${sep}\"$1\""
    sep=", "
  }
  if [[ "$MODE" == "dev" ]]; then
    append_arg_json "dev"
  elif [[ -n "${PORT_ARG:-}" ]]; then
    append_arg_json "--port"
    append_arg_json "$PORT_ARG"
  fi
  if [[ -n "${PROFILE_HOME_ARG:-}" ]]; then
    append_arg_json "--profile-home"
    append_arg_json "$PROFILE_HOME_ARG"
  fi
  args_json+="]"

  # Port probe WITHOUT -f: ANY http answer counts — a previous error page
  # instance, or an old DSH that survived the kill. Either way someone is
  # already answering on $PORT; do not fight over it (idempotency guard).
  if curl -sS -o /dev/null -m 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo "note: port $PORT already answers, not starting the error page server"
    echo "error: $reason" >&2
    exit 1
  fi

  # State file doubles as the marker the plugin reads after a later successful
  # start, to tell the user "the previous restart had failed". Preserve the
  # retry counter: the error-page server increments it on every retry press,
  # and each repeated failure rewrites this file — without this the count
  # would reset to zero on every cycle.
  # `|| true` is load-bearing: sed exits 2 on a missing file and pipefail+set -e
  # would abort the whole worker here — before the marker is written and before
  # the error page starts. That is the normal first-failure case (a successful
  # restart removes the marker), so without this the fallback never runs at all.
  local prev_retries prev_last
  prev_retries="$(sed -n 's/.*"retryCount": *\([0-9]\{1,\}\).*/\1/p' "$cfg" 2>/dev/null | tail -1 || true)"
  prev_last="$(sed -n 's/.*"lastRetryAt": *"\([^"]*\)".*/\1/p' "$cfg" 2>/dev/null | tail -1 || true)"
  cat > "$cfg" <<EOF
{
  "time": "$(date '+%Y-%m-%dT%H:%M:%S')",
  "mode": "$MODE",
  "port": $PORT,
  "reason": "$reason",
  "profileHome": "$PROFILE_HOME",
  "scriptPath": "$(cd "$(dirname "$0")" && pwd)/$(basename "$0")",
  "args": $args_json,
  "workerPid": $$,
  "retryCount": ${prev_retries:-0},
  "lastRetryAt": "${prev_last:-}"
}
EOF

  local node_bin err_server err_log
  node_bin="${NODE_BIN:-$(command -v node 2>/dev/null || echo "$HOME/node/bin/node")}"
  err_server="$(cd "$(dirname "$0")" && pwd)/dsh-restart-error-server.js"
  err_log="$PROFILE_HOME/dsh-restart-error-server.log"
  if [[ ! -x "$node_bin" || ! -f "$err_server" ]]; then
    echo "error: cannot start error page server (node=$node_bin server=$err_server)" >&2
    echo "error: $reason" >&2
    exit 1
  fi
  : > "$err_log"
  echo "serving failure report at http://127.0.0.1:$PORT/ (log: $err_log)"
  nohup setsid "$node_bin" "$err_server" --config "$cfg" >>"$err_log" 2>&1 < /dev/null &
  sleep 1
  if curl -sS -o /dev/null -m 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo "error page is live at http://127.0.0.1:$PORT/ (refresh the old DSH tab to see it)"
  else
    echo "warning: error page did not come up, see $err_log" >&2
  fi
  echo "error: $reason" >&2
  exit 1
}

if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "error: profile directory not found: $PROFILE_DIR" >&2
  exit 1
fi

echo "=== dsh-restart worker $(date '+%F %T') ==="
echo "mode: $MODE  profile: $PROFILE_HOME  port: $PORT"

# --- systemd delegation -----------------------------------------------------
# When the target is the unit's own instance (prod mode, default port, default
# home ~/.dsh — the unit sets no DSH_HOME) and dsh.service is active, delegate
# the restart to systemctl. This prevents port conflicts between script
# kill/nohup and systemd auto-heal. A custom --profile-home or --port names an
# instance the unit does not own, so delegating would restart the wrong one.
if [[ "$MODE" == "prod" && -z "${PORT_ARG:-}" && "$PROFILE_HOME" == "$HOME/.dsh" ]] && systemctl --user is-active --quiet dsh.service 2>/dev/null; then
  echo "detected active systemd service: dsh.service; delegating restart to systemctl..."
  if systemctl --user restart dsh.service; then
    # MainPID reads 0 until systemd has spawned the replacement, and `kill -0 0`
    # succeeds (it addresses the process group), so an unparsed 0 must never
    # reach the liveness check below — it would report a dead service as alive.
    NEW_PID=""
    for _ in $(seq 1 40); do
      candidate="$(systemctl --user show --property MainPID --value dsh.service 2>/dev/null || true)"
      if [[ "$candidate" =~ ^[1-9][0-9]*$ ]]; then
        NEW_PID="$candidate"
        break
      fi
      sleep 0.25
    done
    echo "systemctl restart command issued, new pid: ${NEW_PID:-unknown}"
    if [[ -n "$NEW_PID" ]]; then
      echo "$NEW_PID" > "$PROFILE_HOME/dsh-restart.pid"
    else
      echo "warning: dsh.service reported no main pid; relying on the readiness probe" >&2
    fi
    WAIT_FOR_READINESS_ONLY=1
  else
    echo "warning: systemctl --user restart dsh.service failed, falling back to manual process kill"
  fi
fi

if [[ "${WAIT_FOR_READINESS_ONLY:-0}" != "1" ]]; then

# Find the currently running DSH web process bound to the target profile.
# The pattern alone cannot tell instances apart: the production spelling
# `dsh --profile web` and the dev spelling `dsh web --port 18888` both match it
# (19888 included), so the DSH_HOME of each candidate decides.
find_dsh_pids() {
  local pid cmdline process_home
  for pid in $(pgrep -f '[n]ode .*/dsh( --profile web| web)( |$)' || true); do
    cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    process_home="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^DSH_HOME=//p' | tail -1 || true)"
    # No DSH_HOME in the environment means the process took its own default,
    # which is only this profile when the profile is the default one.
    process_home="${process_home:-$HOME/.dsh}"
    process_home="${process_home%/}"
    if [[ "$process_home" != "$PROFILE_HOME" ]]; then
      echo "note: leaving pid $pid alone (DSH_HOME=$process_home)" >&2
      continue
    fi
    echo "$pid"
  done
}
PIDS="$(find_dsh_pids | paste -sd ' ' -)"

# Carry the running process's working directory across the restart. The
# systemd unit pins WorkingDirectory; a manual relaunch from $HOME silently
# moved every new Session's default workspace there. Reading /proc keeps the
# relaunch faithful to whatever actually launched the process being replaced.
OLD_CWD=""
for pid in $PIDS; do
  candidate="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  if [[ -n "$candidate" && -d "$candidate" ]]; then
    OLD_CWD="$candidate"
    break
  fi
done

if [[ -n "$PIDS" ]]; then
  echo "stopping DSH: $PIDS"
  kill $PIDS 2>/dev/null || true
  # Wait for the old process(es) to exit and release the port. SIGTERM gets
  # 10s; a process that outlives it is holding the port, and starting the
  # replacement anyway would only make the new one die on EADDRINUSE.
  for _ in $(seq 1 50); do
    ALIVE=""
    for pid in $PIDS; do
      if kill -0 "$pid" 2>/dev/null; then ALIVE="$ALIVE $pid"; fi
    done
    if [[ -z "$ALIVE" ]]; then break; fi
    sleep 0.2
  done
  if [[ -n "${ALIVE:-}" ]]; then
    echo "warning: still alive after SIGTERM:$ALIVE; sending SIGKILL" >&2
    # Word-split is intended: ALIVE is a space-separated pid list.
    kill -KILL $ALIVE 2>/dev/null || true
    for _ in $(seq 1 25); do
      STILL=""
      for pid in $ALIVE; do
        if kill -0 "$pid" 2>/dev/null; then STILL="$STILL $pid"; fi
      done
      if [[ -z "$STILL" ]]; then break; fi
      sleep 0.2
    done
    if [[ -n "${STILL:-}" ]]; then
      serve_error_page_and_fail "旧 DSH 进程未被杀死，端口无法释放 (old DSH process survived SIGKILL:$STILL)"
    fi
  fi
  sleep 1
else
  echo "no existing DSH process found, starting fresh"
fi

# Make Node's built-in fetch honor HTTP(S)_PROXY/NO_PROXY. This is required
# for providers such as Google Gemini that are only reachable through the
# local proxy (e.g. 127.0.0.1:10808). Node's fetch does not read proxy env
# vars unless --use-env-proxy is enabled. NODE_USE_ENV_PROXY is the primary
# switch: VS Code deletes NODE_OPTIONS from every child environment it spawns,
# so a dsh started by the IDE extension only inherits the plain variable.
export NODE_USE_ENV_PROXY=1
if [[ -z "${NODE_OPTIONS:-}" ]]; then
  export NODE_OPTIONS="--use-env-proxy"
else
  case " $NODE_OPTIONS " in
    *" --use-env-proxy "*) : ;;
    *) export NODE_OPTIONS="$NODE_OPTIONS --use-env-proxy" ;;
  esac
fi

echo "starting DSH ($MODE)  NODE_USE_ENV_PROXY=$NODE_USE_ENV_PROXY  NODE_OPTIONS=$NODE_OPTIONS"
DSH_EXEC="${DSH_BIN:-$(which dsh 2>/dev/null || echo "$HOME/node/bin/dsh")}"
if [[ "$MODE" == "dev" ]]; then
  cd "${DSH_WORKSPACE:-${OLD_CWD:-$PWD}}"
  # -u DSH_RESTART_DETACHED/-u DSH_SHELL/-u DSH_RESTART_ALLOWED: never leak
  # the launcher's markers into the DSH environment. A worker carries
  # DSH_RESTART_DETACHED=1; if the started DSH inherits it, the NEXT
  # scheduled helper skips launcher mode entirely and the marker propagates
  # to every future generation (seen live in production). ALLOWED is stripped
  # too: combined with an inherited DSH_SHELL it would silently bypass the
  # "refuse to restart from inside a DSH session" guard.
  DSH_HOME="$PROFILE_HOME" \
  nohup setsid env -u DSH_RESTART_DETACHED -u DSH_SHELL -u DSH_RESTART_ALLOWED "$DSH_EXEC" web --no-open "${EXTRA_ARGS[@]}" >>"$PROFILE_HOME/dsh-web.out.log" 2>&1 < /dev/null &
else
  # --no-open: the tab that requested the restart reconnects on its own; without
  # it every restart opened a second tab with a fresh launch token. The systemd
  # unit already passes it — only this hand-launched path was missing it.
  cd "${DSH_WORKSPACE:-${OLD_CWD:-$HOME}}"
  DSH_HOME="$PROFILE_HOME" \
  nohup setsid env -u DSH_RESTART_DETACHED -u DSH_SHELL -u DSH_RESTART_ALLOWED "$DSH_EXEC" --profile web --no-open "${EXTRA_ARGS[@]}" >>"$PROFILE_HOME/dsh-web.out.log" 2>&1 < /dev/null &
fi

NEW_PID=$!
echo "launched pid: $NEW_PID"
echo "$NEW_PID" > "$PROFILE_HOME/dsh-restart.pid"

fi # end if [[ "${WAIT_FOR_READINESS_ONLY:-0}" != "1" ]]

# Wait until the web server responds.
# Check NEW_PID liveness FIRST: if it died during startup (e.g. the port is
# still held by an old process we failed to kill), the port probe below would
# pass against that stale process and report a false "DSH is up".
for _ in $(seq 1 60); do
  # Only a real pid can be probed. An empty NEW_PID means the systemd branch
  # never learned it; the readiness probe below is then the sole verdict.
  if [[ -n "$NEW_PID" ]] && ! kill -0 "$NEW_PID" 2>/dev/null; then
    serve_error_page_and_fail "新进程启动即退出 (new DSH process exited during startup)"
  fi
  # Readiness probe WITHOUT -f, same as the two probes above: DSH answers 401
  # on / until the browser presents a launch token, and -f scores that as a
  # failure — the full 30s wait would then expire against a healthy server and
  # the success path below (which clears restart-failed.json) would never run.
  if curl -sS -o /dev/null -m 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo "DSH is up at http://127.0.0.1:$PORT/"
    # Restart succeeded: clear the failure marker so the plugin does not
    # report a stale failure on this boot.
    rm -f "$PROFILE_HOME/restart-failed.json"
    exit 0
  fi
  sleep 0.5
done
serve_error_page_and_fail "等待30秒后 Web 服务仍未就绪 (did not become ready within 30s)"
