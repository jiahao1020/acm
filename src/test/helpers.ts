import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Point Home-relative client paths at a throwaway directory.
 *
 * Adapters resolve paths through homeDir() at call time, which reads
 * HOME/USERPROFILE, so this covers POSIX and Windows without patching
 * os.homedir (which @types/node declares read-only).
 *
 * An async callback is awaited before the directory is removed: deleting it
 * first left a still-running command writing into a path that no longer
 * existed, which surfaced as an unhandled rejection after the test had already
 * passed.
 */
export async function withFakeHome(
  fn: (home: string) => void | Promise<void>
): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "acm-home-"));
  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // Hermes resolves its home from LOCALAPPDATA on Windows; without this it
  // would read (and in a write test, overwrite) the real Hermes install.
  process.env.LOCALAPPDATA = path.join(home, "AppData", "Local");
  try {
    await fn(home);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

/**
 * Run `fn` while capturing everything written to stdout/stderr, and return the
 * combined text.
 *
 * The commands are tested end-to-end through their console output (that is
 * their entire user-visible contract), so the assertions need the real text.
 * chalk is disabled for the duration to keep the assertions free of ANSI codes.
 */
export async function captureOutput(
  fn: () => void | Promise<void>
): Promise<string> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const prevLevel = process.env.FORCE_COLOR;
  process.env.FORCE_COLOR = "0";

  process.stdout.write = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };

  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    if (prevLevel === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prevLevel;
  }

  const text = chunks.join("");
  // Strip any residual escape sequences from chalk/prompts.
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

/** Reset process.exitCode around a test and report what it was set to. */
export async function withExitCode(
  fn: () => void | Promise<void>
): Promise<number | undefined> {
  const prev = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return process.exitCode;
  } finally {
    process.exitCode = prev;
  }
}
