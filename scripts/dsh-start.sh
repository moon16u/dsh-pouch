#!/usr/bin/env bash
set -euo pipefail

# Start the production DSH web profile detached from the calling terminal.
# Paths are derived from the user's home and the profile's own state directory.
PROFILE_HOME="${DSH_HOME:-$HOME/.dsh}"
PORT="${DSH_PORT:-3080}"
DSH_EXEC="${DSH_BIN:-$(command -v dsh 2>/dev/null || printf '%s/node/bin/dsh' "$HOME")}"
LOG="$PROFILE_HOME/dsh-web.out.log"
PID_FILE="$PROFILE_HOME/dsh.pid"

is_dsh_web_pid() {
  local pid="$1" cmdline process_home
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
  case "$cmdline" in
    *"/dsh --profile web"*|*"/dsh web"*|*"/dsh/"*" --profile web"*|*"/dsh/"*" web"*) ;;
    *) return 1 ;;
  esac
  [[ "$cmdline" != *"--port 18888"* ]] || return 1
  process_home="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^DSH_HOME=//p' | tail -1)"
  [[ -z "$process_home" || "$process_home" == "$PROFILE_HOME" ]]
}

port_owner_pids() {
  command -v ss >/dev/null 2>&1 || return 0
  ss -ltnp "( sport = :$PORT )" 2>/dev/null |
    sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' |
    sort -un
}

find_running_pid() {
  local file pid
  for file in "$PID_FILE" "$PROFILE_HOME/dsh-restart.pid"; do
    [[ -s "$file" ]] || continue
    pid="$(tr -d '[:space:]' < "$file")"
    if is_dsh_web_pid "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
  done
  while IFS= read -r pid; do
    if is_dsh_web_pid "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
  done < <(pgrep -f '[d]sh|[b]in\.js' || true)
  while IFS= read -r pid; do
    if is_dsh_web_pid "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
  done < <(port_owner_pids)
  return 1
}

if [[ ! -x "$DSH_EXEC" ]]; then
  printf 'error: dsh executable not found: %s\n' "$DSH_EXEC" >&2
  exit 1
fi

mkdir -p "$PROFILE_HOME"

if pid="$(find_running_pid)"; then
  printf '%s\n' "$pid" > "$PID_FILE"
  printf 'DSH is already running (pid %s) at http://127.0.0.1:%s/\n' "$pid" "$PORT"
  exit 0
fi

# Clear stale PID metadata only after the live-process check above.
: > "$PID_FILE"

if command -v curl >/dev/null 2>&1 && curl --noproxy '*' -sS -o /dev/null -m 2 "http://127.0.0.1:$PORT/" 2>/dev/null; then
  owners="$(port_owner_pids | paste -sd ' ' -)"
  if [[ -n "$owners" ]]; then
    printf 'error: port %s is already serving another process (pid %s)\n' "$PORT" "$owners" >&2
  else
    printf 'error: port %s is already serving another process\n' "$PORT" >&2
  fi
  exit 1
fi

if [[ -z "${NODE_OPTIONS:-}" ]]; then
  export NODE_OPTIONS="--use-env-proxy"
elif [[ " $NODE_OPTIONS " != *" --use-env-proxy "* ]]; then
  export NODE_OPTIONS="$NODE_OPTIONS --use-env-proxy"
fi

report_start_failure() {
  local reason="$1"
  printf 'error: %s\n' "$reason" >&2
  if [[ -s "$LOG" ]]; then
    printf '%s\n' '--- recent DSH log ---' >&2
    tail -40 "$LOG" >&2 || true
    printf '%s\n' '--- end DSH log ---' >&2
  fi
  rm -f "$PID_FILE"
  exit 1
}

cd "$HOME"
printf '\n=== manual DSH start %s ===\n' "$(date '+%F %T')" >>"$LOG"
DSH_HOME="$PROFILE_HOME" \
  nohup setsid env -u DSH_RESTART_DETACHED -u DSH_SHELL -u DSH_RESTART_ALLOWED \
  "$DSH_EXEC" --profile web >>"$LOG" 2>&1 < /dev/null &
pid=$!
printf '%s\n' "$pid" > "$PID_FILE"

for _ in $(seq 1 60); do
  if ! kill -0 "$pid" 2>/dev/null; then
    report_start_failure "DSH exited during startup (pid $pid)"
  fi
  if curl --noproxy '*' -sS -o /dev/null -m 1 "http://127.0.0.1:$PORT/" 2>/dev/null; then
    printf 'started DSH in background (pid %s)\n' "$pid"
    printf 'url: http://127.0.0.1:%s/\n' "$PORT"
    printf 'log: %s\n' "$LOG"
    exit 0
  fi
  sleep 0.5
done

if kill -0 "$pid" 2>/dev/null; then
  report_start_failure "DSH did not become ready on port $PORT within 30 seconds (pid $pid)"
else
  report_start_failure "DSH exited before becoming ready (pid $pid)"
fi
