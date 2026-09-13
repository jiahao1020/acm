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
  /**
   * Every skill on disk, bundled ones included.
   * @see isBundledSkill for why the two lists differ.
   */
  listAllSkills?(): string[];
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

  /**
   * True when `name` is a skill that shipped with the client itself rather
   * than one the user owns.
   *
   * This is narrower than {@link isCatalog}: a client can mix its own bundled
   * catalogue with user skills in one root (Hermes ships ~99 bundled skills
   * alongside 14 user-owned ones), so exclusion has to be per skill. The
   * client still takes part in sync in both directions — only these names are
   * hidden from the comparison, so a bundled skill never shows up as "missing"
   * from every other client.
   *
   * @param dir Absolute path of the skill, when the caller already knows it.
   *   Callers that are iterating a listing should pass it: resolving the path
   *   again means a full tree walk per skill, which on a client with a large
   *   nested catalogue is quadratic. Optional so a caller holding only a name
   *   still works.
   */
  isBundledSkill?(name: string, dir?: string): boolean;
}
