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

## Release scripts

Each package in this workspace versions and publishes independently, so the only thing keeping their releases apart is the git tag. These two scripts run before the tag is pushed; `.github/workflows/publish.yml` does the publishing.

| File | Role |
| :--- | :--- |
| `release-check.mjs` | Preflight for one package: `private` absent, `publishConfig` public, `engines.node` declared, the version not already on npm, the tag unused, and HEAD plus the working tree both carrying that exact version. |
| `release-tag.mjs` | Creates the annotated tag `v<package>@<version>` at HEAD once the preflight passes. |

## Releasing a package

```bash
# 1. bump the version in packages/<name>/package.json and commit it
node scripts/release-check.mjs dsh-hooks
node scripts/release-tag.mjs  dsh-hooks

# 2. push the code and the tag; the tag is what triggers publishing
git push origin main
git push origin vdsh-hooks@2.0.1
```

The workflow reads the package directory and version out of the tag, checks that `packages/<name>/package.json` agrees, runs that package's tests, refuses a version npm already has, publishes with provenance, then polls until the version resolves. A tag that does not match the manifest fails before npm is touched.

`NPM_TOKEN` must be a repository secret with publish rights on the `@moon16u` scope. `--provenance` needs the workflow's `id-token: write` permission, which is already set.

### Tag history

| Tag | Package |
| :--- | :--- |
| `vdsh-hooks@2.0.0` | first npm release, published before the workflow existed |
| `vdsh-mcp-console@0.3.8` | |
| `vdsh-restart@0.4.4` | |

Versions published before this automation have no tag on the commit that introduced them; tags cover releases from here on.

