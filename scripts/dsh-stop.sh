#!/usr/bin/env bash
set -euo pipefail

PROFILE_HOME="${DSH_HOME:-$HOME/.dsh}"
PID_FILE="$PROFILE_HOME/dsh.pid"
PORT="${DSH_PORT:-3080}"
mkdir -p "$PROFILE_HOME"

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

pids=()
for file in "$PID_FILE" "$PROFILE_HOME/dsh-restart.pid"; do
  [[ -s "$file" ]] || continue
  pid="$(tr -d '[:space:]' < "$file")"
  if is_dsh_web_pid "$pid" && [[ " ${pids[*]-} " != *" $pid "* ]]; then
    pids+=("$pid")
  fi
done
while IFS= read -r pid; do
  if is_dsh_web_pid "$pid" && [[ " ${pids[*]-} " != *" $pid "* ]]; then
    pids+=("$pid")
  fi
done < <(pgrep -f '[d]sh|[b]in\.js' || true)
while IFS= read -r pid; do
  if is_dsh_web_pid "$pid" && [[ " ${pids[*]-} " != *" $pid "* ]]; then
    pids+=("$pid")
  fi
done < <(port_owner_pids)

if [[ "${#pids[@]}" -eq 0 ]]; then
  : > "$PID_FILE"
  if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$PORT )" 2>/dev/null | tail -n +2 | grep -q .; then
    printf 'DSH is not running; port %s is occupied by a non-DSH process\n' "$PORT"
  else
    printf 'DSH is not running\n'
  fi
  exit 0
fi

kill -TERM "${pids[@]}"
for _ in $(seq 1 50); do
  alive=()
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      alive+=("$pid")
    fi
  done
  if [[ "${#alive[@]}" -eq 0 ]]; then
    : > "$PID_FILE"
    printf 'stopped DSH (pid %s)\n' "${pids[*]}"
    exit 0
  fi
  sleep 0.2
done

printf 'DSH did not exit after 10 seconds; sending SIGKILL to pid %s\n' "${alive[*]}" >&2
kill -KILL "${alive[@]}" 2>/dev/null || true
: > "$PID_FILE"
printf 'stopped DSH (pid %s)\n' "${pids[*]}"
