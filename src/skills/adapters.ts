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
 * Hermes Agent's skills.
 *
 * Separate from the spec table because Hermes is the one client whose skills
 * root is not under `$HOME` — it lives in the platform's local app-data
 * directory — and whose layout nests skills one level deeper, inside category
 * folders. A spec root is always joined onto `homeDir()`, which would produce a
 * wrong path here, so the class resolves its own.
 *
 * Depth is 1: `<root>/srm-business/pangu-prod-data-fix/SKILL.md`. Treating it
 * as flat would report the 17 category folders as skills and hide all 113 real
 * ones.
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
}
