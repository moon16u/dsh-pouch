# scripts/

Manual start/stop for the `web` profile, for use when you want to drive DSH by hand instead of through `dsh.service`.

| File | Where | Role |
| :--- | :--- | :--- |
| `dsh-start.bat` | Windows | Double-click entry point. Translates its own folder to a WSL path and execs the shell script. |
| `dsh-stop.bat` | Windows | Same, for stopping. |
| `dsh-start.sh` | WSL | Real start logic: refuses a duplicate, detaches with `setsid`, waits for the port, writes `~/.dsh/dsh.pid`. |
| `dsh-stop.sh` | WSL | Real stop logic: SIGTERM, then SIGKILL after 10 s, clears the pid file. |

## Usage

From WSL:

```bash
./dsh-start.sh
./dsh-stop.sh
```

From Windows Explorer: double-click `dsh-start.bat` / `dsh-stop.bat`. Both wrap the bash script through `wsl.exe`, so the WSL default distribution must be the one holding this checkout.

Environment: `DSH_HOME` (default `~/.dsh`), `DSH_PORT` (default `3080`), `DSH_BIN` (default: `dsh` on `PATH`, else `~/node/bin/dsh`).

## Relationship to dsh.service

These scripts do not know about the systemd unit. Both sides use `~/.dsh/dsh.pid` and port 3080, so:

- If `dsh.service` is running, `dsh-start.sh` detects the listener and reports "already running" instead of starting a second one.
- `dsh-stop.sh` signals whatever DSH process it finds; it never calls `systemctl`. When the intent is to stop the service, use `systemctl --user stop dsh` so the unit's own state stays truthful.
- A service restarted by systemd overwrites the pid file with its own PID.

Pick one owner per machine. The scripts exist so that a manual run stays possible when the unit is disabled or being debugged.
