import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));

export function packedFixture(scriptMode) {
  const dir = mkdtempSync(join(tmpdir(), "_tmp_restart-package-"));
  try {
    let source = packageRoot;
    if (scriptMode !== undefined) {
      source = join(dir, "source");
      mkdirSync(source);
      for (const entry of ["package.json", "lib", "scripts", "cordis.patch.yml"]) {
        cpSync(join(packageRoot, entry), join(source, entry), { recursive: true });
      }
      chmodSync(join(source, "scripts", "dsh-restart.sh"), scriptMode);
    }
    const result = JSON.parse(execFileSync("npm", [
      "pack", source, "--ignore-scripts", "--offline", "--json",
      "--cache", join(dir, "cache"), "--pack-destination", dir,
    ], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    const archive = join(dir, result[0].filename);
    execFileSync("tar", ["-xzf", archive, "-C", dir], { stdio: "pipe" });
    return {
      dir, archive, pkg: join(dir, "package"),
      cleanup() { renameSync(dir, `${dir}.recovered`); },
    };
  } catch (error) {
    renameSync(dir, `${dir}.recovered`);
    throw error;
  }
}
