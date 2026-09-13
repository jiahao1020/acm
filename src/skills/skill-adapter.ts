/**
 * Interface for managing Agent Skills (SKILL.md folders) for one client.
 *
 * Unlike MCP config, the on-disk layout is identical across clients:
 *   <skillsRoot>/<skill-name>/SKILL.md
 * so adapters only need to know where their skills root(s) live.
 */
export interface SkillAdapter {
  id: string;
  displayName: string;
  /** True when the client appears installed on this machine. */
  detect(): boolean;
  /** Skills roots, most-preferred first. Missing dirs are created on install. */
  getSkillsDirs(): string[];
  /** Skill names present in any of this client's skills roots. */
  listSkills(): string[];
  /** Absolute path of an installed skill, or null. */
  findSkill(name: string): string | null;
  /**
   * Copy a skill folder into this client.
   * @throws when the skill already exists and `force` is false.
   */
  installSkill(name: string, srcDir: string, force?: boolean): void;
  /** Delete a skill from every skills root. Returns true if anything was removed. */
  removeSkill(name: string): boolean;
  /**
   * True for bulk catalogs (e.g. a marketplace holding hundreds of skills).
   * Sync skips these as sources unless explicitly requested via --from, so a
   * catalog doesn't flood every other client.
   */
  isCatalog?(): boolean;
}
