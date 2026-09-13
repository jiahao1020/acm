import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Point Home-relative client paths at a throwaway directory.
 *
 * Adapters resolve paths through homeDir() at call time, which reads
 * HOME/USERPROFILE, so this covers POSIX and Windows without patching
 * os.homedir (which @types/node declares read-only).
 */
export function withFakeHome(fn: (home: string) => void): void {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "acm-home-"));
  const savedHome = process.env.HOME;
  const savedProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    fn(home);
  } finally {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

/** Create a minimal skill folder at `dir`. */
export function makeSkill(
  dir: string,
  name: string,
  extra?: Record<string, string>
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  for (const [rel, content] of Object.entries(extra ?? {})) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
}
