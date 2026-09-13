import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * Copy `filePath` to `<filePath>.bak` when it exists, so a bad write is recoverable.
 *
 * The previous version of the file is kept, not an ever-growing history: a
 * single `.bak` answers "what did I just overwrite?", which is the question
 * that matters here, and it keeps the client's config directory from filling up
 * with copies of a file whose own tooling may pick them up.
 */
export function backupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + ".bak");
  }
}

/**
 * Write text through a temp file plus rename, so an interrupted write cannot
 * leave a half-written config behind. Creates missing parent directories.
 *
 * Windows keeps the target locked while the owning client is running; that
 * surfaces as EPERM/EACCES/EBUSY on rename, which we translate into an
 * actionable message instead of a raw errno.
 */
export function writeTextAtomic(filePath: string, text: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  backupFile(filePath);

  // The temp name carries a random suffix: a fixed `filePath + ".tmp"` made two
  // concurrent acm runs fight over the same staging file, so one could rename
  // the other's half-written content into place.
  const tmp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, text, "utf-8");
  try {
    fs.renameSync(tmp, filePath);
  } catch (err: unknown) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // Best effort — the original error is the one that matters.
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
      throw new Error(
        `Cannot replace ${filePath} — the file is locked. Close the client using it and retry.`
      );
    }
    throw err;
  }
}
