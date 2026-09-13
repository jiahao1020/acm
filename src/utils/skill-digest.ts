import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Never skill content, and large enough to distort a cheap comparison. */
const SKIP_DIRS = new Set([".git"]);

/**
 * Content digest of a skill folder.
 *
 * Skills are matched across clients by folder name alone, so two clients can
 * quietly hold different versions of the same skill and every diff looks clean.
 * Hashing the relative paths and file bytes makes that visible.
 *
 * Symlinks are followed, matching how copyDir materialises skills into real
 * files — a linked copy and a real copy of the same skill must compare equal.
 */
export function digestSkillDir(dir: string): string {
  const hash = crypto.createHash("sha256");
  walk(dir, "", hash);
  return hash.digest("hex");
}

/**
 * Memoised `digestSkillDir`, keyed by absolute directory path.
 *
 * Digests are not cheap: the function reads every byte of the folder, and a
 * real skills tree runs to tens of megabytes. Both `list` and `sync` ask for
 * the same folder repeatedly — once per client holding it, plus once per
 * client being compared against it — so without a cache a single run hashes the
 * same folder several times over.
 *
 * The cache lives for one command run. Nothing writes into a skills root while
 * a digest is being computed, so a path's content cannot change underneath it.
 *
 * `compute` is injectable so the deduplication itself is testable: `fs`'s
 * methods are read-only getters on modern Node, so the number of filesystem
 * passes cannot be observed by patching the fs module.
 */
export class SkillDigestCache {
  private readonly byPath = new Map<string, string | null>();

  constructor(
    private readonly compute: (dir: string) => string = digestSkillDir
  ) {}

  /** Digest of `dir`, or null when the folder does not exist. */
  of(dir: string): string | null {
    if (!this.byPath.has(dir)) {
      this.byPath.set(dir, fs.existsSync(dir) ? this.compute(dir) : null);
    }
    return this.byPath.get(dir)!;
  }
}

function walk(dir: string, prefix: string, hash: crypto.Hash): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // Sort so the digest does not depend on directory iteration order.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(full); // follows symlinks
    } catch {
      continue; // dangling link — nothing to hash
    }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      hash.update(`D\0${rel}\0`);
      walk(full, rel, hash);
    } else if (stat.isFile()) {
      hash.update(`F\0${rel}\0`);
      try {
        hash.update(fs.readFileSync(full));
      } catch {
        hash.update("<unreadable>");
      }
      hash.update("\0");
    }
  }
}
