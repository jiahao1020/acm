import * as path from "path";
import * as fs from "fs";
import { homeDir, hermesHome } from "../utils/paths";
import { listSkillDirsAt } from "../utils/fs-copy";
import { BaseSkillAdapter } from "./base-skill-adapter";

/**
 * Client skills roots.
 *
 * Every supported client uses the same on-disk layout
 * (`<root>/<skill-name>/SKILL.md`), so adapters differ only by path — a data
 * table beats one class per client.
 *
 * Paths are relative to the user's home directory. `installDir` is the folder
 * whose existence means the client is installed; it defaults to the parent of
 * the first skills root.
 */
export interface SkillClientSpec {
  id: string;
  displayName: string;
  /** One or more skills roots; the first is where installs go. */
  roots: string[];
  /** Override when the install marker is not the first root's parent. */
  installDir?: string;
  /** Bulk catalog (e.g. a marketplace) — excluded from diffs/sync by default. */
  catalog?: boolean;
  /**
   * Group levels between a root and a skill. 0 (the default) is the common
   * `<root>/<skill>/SKILL.md`; 1 is a client that groups skills into category
   * folders, e.g. Hermes' `<root>/srm-business/<skill>/SKILL.md`.
   */
  depth?: number;
}

export const SKILL_CLIENTS: SkillClientSpec[] = [
  { id: "claude-code", displayName: "Claude Code", roots: [".claude/skills"] },
  { id: "opencode", displayName: "OpenCode", roots: [".config/opencode/skills"] },
  { id: "workbuddy", displayName: "Workbuddy", roots: [".workbuddy/skills"] },
  { id: "codex", displayName: "Codex", roots: [".codex/skills"] },
  {
    id: "windsurf",
    displayName: "Windsurf",
    roots: [".codeium/windsurf/skills"],
    installDir: ".codeium/windsurf",
  },
  { id: "qwen-code", displayName: "QwenCode", roots: [".qwen/skills"] },
  { id: "trae", displayName: "Trae", roots: [".trae/skills"] },
  { id: "roo", displayName: "Roo", roots: [".roo/skills"] },
  { id: "kiro", displayName: "Kiro", roots: [".kiro/skills"] },
  {
    id: "zcode",
    displayName: "ZCode",
    // ZCode reads its own root plus the shared ~/.agents/skills
    roots: [".zcode/skills", ".agents/skills"],
    installDir: ".zcode",
  },
  {
    id: "codebuddy",
    displayName: "CodeBuddy",
    roots: [".codebuddy/skills-marketplace/skills"],
    catalog: true,
  },
];

/** Concrete adapter built from a spec. */
export class SpecSkillAdapter extends BaseSkillAdapter {
  readonly id: string;
  readonly displayName: string;
  private readonly spec: SkillClientSpec;

  constructor(spec: SkillClientSpec) {
    super();
    this.spec = spec;
    this.id = spec.id;
    this.displayName = spec.displayName;
  }

  protected skillsDirs(): string[] {
    return this.spec.roots.map((r) => path.join(homeDir(), ...r.split("/")));
  }

  protected installDir(): string {
    if (this.spec.installDir) {
      return path.join(homeDir(), ...this.spec.installDir.split("/"));
    }
    // Default: parent of the first skills root
    const first = this.spec.roots[0];
    const parent = first.split("/").slice(0, -1).join("/");
    return path.join(homeDir(), ...parent.split("/"));
  }

  protected depth(): number {
    return this.spec.depth ?? 0;
  }

  isCatalog(): boolean {
    return this.spec.catalog === true;
  }
}

/**
 * Hermes category folders that hold the user's own skills rather than Hermes'
 * bundled catalogue.
 *
 * Hermes groups everything under `<root>/<category>/<skill>`, and a user skill
 * dropped into one of these folders may carry no metadata at all — so the
 * folder is the only thing left to key on. `srm-business` is where this user
 * keeps their SRM skills; add their own categories here as needed.
 */
export const USER_CATEGORIES = new Set(["srm-business"]);

/**
 * Hermes Agent's skills.
 *
 * Separate from the spec table because Hermes is the one client whose skills
 * root is not under `$HOME` — it lives in the platform's local app-data
 * directory — and whose layout nests skills one level deeper, inside category
 * folders. A spec root is always joined onto `homeDir()`, which would produce a
 * wrong path here, so the class resolves its own.
 *
 * Depth is 1: `<root>/srm-business/pangu-prod-data-fix/SKILL.md`. Treating it
 * as flat would report the category folders as skills and hide all the real
 * ones. Depth 1 also still accepts a skill sitting directly at the root
 * (`<root>/yuanbao/SKILL.md`), which Hermes allows; it is deliberately not 2,
 * so the third-level skills under `mlops/evaluation/` stay out of reach.
 *
 * Hermes ships its own catalogue into the same root as the user's (113 skills
 * across 19 categories on the machine this was written against, of which 14 are
 * the user's). Letting those into the diff makes every other client look like
 * it is missing ~100 skills, so they are excluded per skill via
 * {@link isBundledSkill} — not via `isCatalog`, which would also stop Hermes
 * from being a sync *source* and so make it impossible to push the user's own
 * skills out to the other clients.
 */
export class HermesSkillAdapter extends BaseSkillAdapter {
  id = "hermes";
  displayName = "Hermes";

  protected skillsDirs(): string[] {
    return [path.join(hermesHome(), "skills")];
  }

  protected installDir(): string {
    return hermesHome();
  }

  protected depth(): number {
    return 1;
  }

  /**
   * Hermes' own marker for a skill the user brought in. Stamping it on install
   * is what stops acm from immediately hiding a skill it just wrote.
   */
  protected userOwnedMarker(): string | null {
    return "_user_meta.json";
  }

  /**
   * Skills that shipped with Hermes rather than being authored by the user.
   *
   * Provenance is recorded inconsistently — per-skill meta files for some
   * skills, frontmatter for others, and nothing at all for the rest — so the
   * rule is evidence-based rather than list-based:
   *
   *  1. A category under {@link USER_CATEGORIES} is the user's own space. This
   *     is the only signal that catches a user skill with no metadata at all
   *     (`srm-buried-point` is exactly that).
   *  2. `_user_meta.json` — written by Hermes for an imported/created skill, and
   *     by acm in {@link markUserOwned} on install.
   *  3. `_skillhub_meta.json` — written for a marketplace install. User-chosen,
   *     so also the user's.
   *  4. `agent_created: true` in the `SKILL.md` frontmatter — set by skills the
   *     user's agent authored.
   *
   * Anything with none of the above is treated as bundled.
   *
   * This deliberately does *not* consult `.bundled_manifest`. That file is a
   * snapshot of what one Hermes version shipped: on the machine this was
   * written against it named 58 skills while 113 were on disk, including one
   * name that no longer existed. Keying on it would both miss most of the
   * catalogue and, worse, keep hiding a skill acm had just re-installed — the
   * name stays but the skill is now the user's. The asymmetry is deliberate:
   * a bundled skill wrongly kept out of the comparison is benign, whereas a
   * bundled skill wrongly let in makes every other client look like it is
   * missing ~100 skills.
   */
  isBundledSkill(name: string, knownDir?: string): boolean {
    // Prefer the caller's path: re-resolving a name means walking the whole
    // tree, which is quadratic when listSkills filters every skill.
    const dir = knownDir ?? this.findSkill(name);
    if (dir === null) return false; // not on disk: nothing to exclude

    // The category folder is the skill's parent: <root>/<category>/<skill>.
    // A skill sitting directly at the root has the root itself as parent, which
    // is never a user category — so no special case is needed.
    const category = path.basename(path.dirname(dir));
    if (USER_CATEGORIES.has(category)) return false;

    let entries: Set<string>;
    try {
      entries = new Set(fs.readdirSync(dir));
    } catch {
      return false; // unreadable: do not hide something we cannot inspect
    }
    if (entries.has("_user_meta.json") || entries.has("_skillhub_meta.json")) {
      return false;
    }
    return !this.declaresAgentCreated(dir);
  }

  /** True when SKILL.md frontmatter carries `agent_created: true`. */
  private declaresAgentCreated(dir: string): boolean {
    try {
      const text = fs.readFileSync(path.join(dir, "SKILL.md"), "utf-8");
      const fm = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) return false;
      return /^agent_created:\s*true\s*$/m.test(fm[1]);
    } catch {
      return false;
    }
  }
}
