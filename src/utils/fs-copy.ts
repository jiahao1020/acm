import * as fs from "fs";
import * as path from "path";

/**
 * Recursively copy a skill folder.
 *
 * Symlinks in the source are dereferenced: some clients (e.g. ~/.agents/skills)
 * expose skills as symlinks into a plugin repo, and we want real files at the
 * destination so the copy survives independently of the link target.
 */
export function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) {
    throw new Error(`Source does not exist: ${src}`);
  }
  const stat = fs.statSync(src); // statSync follows symlinks
  if (!stat.isDirectory()) {
    throw new Error(`Source is not a directory: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true, force: true });
}

/** Remove a directory tree if it exists. */
export function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** True when `dir` is a skill folder (contains a SKILL.md file). */
export function isSkillDir(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, "SKILL.md")).isFile();
  } catch {
    return false;
  }
}

/**
 * List skill names in a skills root: subdirectories that contain SKILL.md.
 * Returns [] when the root does not exist.
 */
export function listSkillDirs(skillsRoot: string): string[] {
  if (!fs.existsSync(skillsRoot)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const names: string[] = [];
  for (const entry of entries) {
    const full = path.join(skillsRoot, entry.name);
    // Symlinked skill folders report as symlink; resolve before checking.
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (isDir && isSkillDir(full)) names.push(entry.name);
  }
  return names.sort();
}
