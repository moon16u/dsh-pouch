import { win32 } from "node:path";

// Matches dsh-pwsh-local's UTF-8 preamble, including Windows PowerShell 5.1.
export const POWERSHELL_ENCODING =
  "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); " +
  "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); " +
  "$OutputEncoding = [System.Text.UTF8Encoding]::new($false); ";

const missing = (error) => error?.name === "SubprocessExecutableNotFoundError";

async function powershell(subprocess, platform, env, signal) {
  const candidates = platform === "windows" ? [
    win32.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
    "pwsh",
    win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
  ] : ["pwsh"];
  for (const candidate of candidates) {
    signal.throwIfAborted();
    try {
      const executable = await subprocess.resolveExecutable(candidate, env, signal);
      signal.throwIfAborted();
      return executable;
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  throw new Error("PowerShell is unavailable; install PowerShell 7 or explicitly select shell:bash with Bash on PATH.");
}

/** Select arguments in the provider's execution world, not the browser's OS. */
export async function commandSpec(subprocess, entry, signal) {
  const { platform } = await subprocess.terminalEnvironment(signal);
  signal.throwIfAborted();
  if (!["posix", "windows"].includes(platform)) throw new Error("Unsupported subprocess execution platform");
  const shell = entry.shell === "auto" ? platform === "windows" ? "pwsh" : "bash" : entry.shell;
  const env = { BASH_ENV: undefined, ENV: undefined, NODE_OPTIONS: undefined };
  for (const [key, value] of Object.entries(entry.env)) env[platform === "windows" ? key.toUpperCase() : key] = value;
  Object.assign(env, { DSH_HOOK_ACTIVE: "1", DSH_HOOK_EVENT: entry.event });
  const lookupEnv = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
  if (shell === "pwsh") {
    const executable = await powershell(subprocess, platform, lookupEnv, signal);
    return { env, argv: [executable, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_ENCODING + entry.command] };
  }
  if (shell !== "bash") throw new Error("Unsupported command shell");
  const executable = await subprocess.resolveExecutable("bash", lookupEnv, signal);
  signal.throwIfAborted();
  return { env, argv: [executable, "--noprofile", "--norc", "-c", entry.command] };
}
