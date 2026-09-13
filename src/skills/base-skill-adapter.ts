import * as fs from "fs";
import * as path from "path";
import { SkillAdapter } from "./skill-adapter";
import { isSafeSkillName } from "./skill-name";
import { copyDir, removeDir, listSkillDirsAt } from "../utils/fs-copy";

/**
 * A name that would resolve outside the skills root (`..`, a path, an empty
 * string) must never be joined onto it. Names reach here from CLI arguments and
 * from `SKILL.md` frontmatter inside cloned repositories.
 */
function assertSafeSkillName(name: string): void {
  if (!isSafeSkillName(name)) {
    throw new Error(
      `invalid skill name ${JSON.stringify(name)}: expected a single folder name`
    );
  }
}

/**
 * Shared implementation for clients whose skills live in one or more plain
 * `skills/` roots. Subclasses declare paths only.
 *
 * Subclasses may also declare a `depth`: 0 for the common
 * `<root>/<skill>/SKILL.md`, 1 for a client that groups skills into category
 * folders (Hermes). Depth is the only layout difference acm supports, so it is
 * expressed as data rather than by overriding every method.
 */
export abstract class BaseSkillAdapter implements SkillAdapter {
  abstract id: string;
  abstract displayName: string;

  /** Skills roots, most-preferred first. */
  protected abstract skillsDirs(): string[];
  /** Directory whose existence means the client is installed. */
  protected abstract installDir(): string;
  /** Folder levels between a root and a skill. Defaults to 0 (flat layout). */
  protected depth(): number {
    return 0;
  }

  getSkillsDirs(): string[] {
    return this.skillsDirs();
  }

  detect(): boolean {
    return fs.existsSync(this.installDir());
  }

  listSkills(): string[] {
    const names = new Set<string>();
    for (const root of this.skillsDirs()) {
      for (const n of listSkillDirsAt(root, this.depth())) names.add(n);
    }
    return [...names].sort();
  }

  findSkill(name: string): string | null {
    for (const root of this.skillsDirs()) {
      const found = this.searchForSkill(root, name, this.depth());
      if (found) return found;
    }
    return null;
  }

  /**
   * Find `name` as a skill folder below `dir`, within `level` group levels.
   *
   * Searching rather than joining `dir/name` is what makes a nested layout
   * work: with categories in between, the skill's parent is not known from the
   * name alone, so the tree has to be walked to find where it actually lives.
   */
  private searchForSkill(dir: string, name: string, level: number): string | null {
    const direct = path.join(dir, name);
    try {
      if (fs.statSync(path.join(direct, "SKILL.md")).isFile()) return direct;
    } catch {
      // not directly in this folder
    }
    if (level === 0) return null;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const found = this.searchForSkill(path.join(dir, entry.name), name, level - 1);
      if (found) return found;
    }
    return null;
  }

  /**
   * Install into the *preferred* root only.
   *
   * Extra roots exist so acm can see skills a client shares with another tool
   * (ZCode reads `~/.zcode/skills` plus the shared `~/.agents/skills`). Writing
   * to all of them would duplicate the skill and, worse, leave a copy behind
   * that `list`/`sync` then reports as drift. The first root is where this
   * client's own skills belong, so that is the one we write.
   *
   * With a nested layout the category is not known from the name, so install
   * targets the same category an existing copy lives in, falling back to the
   * root itself — that keeps a re-install beside the skill it replaces instead
   * of stranding it at the top level where list would still find it but nothing
   * else would.
   */
  installSkill(name: string, srcDir: string, force = false): void {
    assertSafeSkillName(name);
    const root = this.skillsDirs()[0];
    const existing = this.findSkill(name);
    const parent = existing ? path.dirname(existing) : root;

    // Guard on the searched-for location too: `existing` covers every root, but
    // a copy elsewhere must not be duplicated into the preferred root silently.
    for (const candidate of new Set([path.join(root, name), existing ?? ""])) {
      if (candidate && fs.existsSync(candidate)) {
        if (!force) {
          throw new Error(`already exists: ${candidate} (use --force to overwrite)`);
        }
        removeDir(candidate);
      }
    }

    const dest = path.join(parent, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyDir(srcDir, dest);
  }

  /**
   * Remove the skill from every root it appears in.
   *
   * Removal must span all roots even though install writes only one: a skill
   * can also live in a shared root because another tool put it there, and
   * "remove" that leaves a findable copy behind is a lie. This asymmetry with
   * installSkill is deliberate.
   */
  removeSkill(name: string): boolean {
    assertSafeSkillName(name);
    let removed = false;
    for (const root of this.skillsDirs()) {
      // Search per root rather than reusing `findSkill`, which stops at the
      // first hit: a copy in a second root must be cleared too, or `list` keeps
      // reporting a skill the user just removed.
      const dir = this.searchForSkill(root, name, this.depth());
      if (dir && fs.existsSync(dir)) {
        removeDir(dir);
        removed = true;
      }
    }
    return removed;
  }
}
