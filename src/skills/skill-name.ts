/**
 * How a skill gets its name.
 *
 * Skills are identified by folder name everywhere else in acm (`list`, `sync`,
 * `remove`, and the clients' own discovery), so a folder name is the default
 * identity. Only two things override it: an explicit `--name`, and the case
 * where the folder is the throwaway clone directory we just created — there the
 * folder name is meaningless, so SKILL.md's `name:` (or the repository name)
 * has to stand in.
 */

/**
 * Derive a usable name from a git URL or a local path:
 * `git@host:user/my-skill.git` → `my-skill`, `C:\repos\my-skill.git` → `my-skill`.
 */
export function gitRepoName(url: string): string | null {
  const trimmed = url.replace(/[/\\]+$/, "");
  const last = trimmed.split(/[/\\:]/).filter(Boolean).pop() ?? "";
  const name = last.replace(/\.git$/i, "");
  return name || null;
}

/**
 * Skill names become directory names, so a name that is empty, is `.`/`..` or
 * carries a path separator must never reach the filesystem. `SKILL.md` comes
 * from cloned repositories, so its declared name is untrusted input.
 */
export function isSafeSkillName(name: string): boolean {
  return name.length > 0 && name !== "." && name !== ".." && !/[/\\]/.test(name);
}

export interface SkillNameInput {
  /** `--name`, which wins over everything. */
  explicit?: string;
  /** Folder name of the located skill folder. */
  dirName: string;
  /** `name:` from SKILL.md, when it declares one. */
  declaredName: string | null;
  /** Repository name, used only when `dirNameIsMeaningful` is false. */
  repoName: string | null;
  /** False when the folder is our own temp clone directory. */
  dirNameIsMeaningful: boolean;
}

export function resolveSkillName(input: SkillNameInput): string {
  if (input.explicit) return input.explicit;
  if (input.dirNameIsMeaningful) return input.dirName;
  return input.declaredName ?? input.repoName ?? input.dirName;
}
