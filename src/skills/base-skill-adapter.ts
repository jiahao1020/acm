import * as fs from "fs";
import * as path from "path";
import { SkillAdapter } from "./skill-adapter";
import { isSafeSkillName } from "./skill-name";
import { copyDir, removeDir, listSkillDirs } from "../utils/fs-copy";

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
 */
export abstract class BaseSkillAdapter implements SkillAdapter {
  abstract id: string;
  abstract displayName: string;

  /** Skills roots, most-preferred first. */
  protected abstract skillsDirs(): string[];
  /** Directory whose existence means the client is installed. */
  protected abstract installDir(): string;

  getSkillsDirs(): string[] {
    return this.skillsDirs();
  }

  detect(): boolean {
    return fs.existsSync(this.installDir());
  }

  listSkills(): string[] {
    const names = new Set<string>();
    for (const root of this.skillsDirs()) {
      for (const n of listSkillDirs(root)) names.add(n);
    }
    return [...names].sort();
  }

  findSkill(name: string): string | null {
    for (const root of this.skillsDirs()) {
      const dir = path.join(root, name);
      try {
        if (fs.statSync(path.join(dir, "SKILL.md")).isFile()) return dir;
      } catch {
        // not here, try next root
      }
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
   */
  installSkill(name: string, srcDir: string, force = false): void {
    assertSafeSkillName(name);
    const root = this.skillsDirs()[0];
    const dest = path.join(root, name);
    if (fs.existsSync(dest)) {
      if (!force) {
        throw new Error(`already exists: ${dest} (use --force to overwrite)`);
      }
      removeDir(dest);
    }
    fs.mkdirSync(root, { recursive: true });
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
      const dir = path.join(root, name);
      if (fs.existsSync(dir)) {
        removeDir(dir);
        removed = true;
      }
    }
    return removed;
  }
}
