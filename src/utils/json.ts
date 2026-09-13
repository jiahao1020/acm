import * as fs from "fs";
import JSON5 from "json5";
import { writeTextAtomic } from "./atomic-write";
import { ConfigParseError } from "./config-error";

/**
 * Read a JSON file, tolerating JSON5 syntax (comments, trailing commas,
 * unquoted keys) since several clients accept those in practice.
 *
 * Returns null when the file is missing or empty. Throws ConfigParseError when
 * the file exists but does not parse, or does not hold a JSON object.
 */
export function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON5.parse(raw);
  } catch (err: unknown) {
    throw new ConfigParseError(filePath, err);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigParseError(filePath, new Error("expected a JSON object"));
  }
  return parsed as Record<string, unknown>;
}

/** Write JSON atomically, backing up the previous contents to `<path>.bak`. */
export function writeJsonFile(filePath: string, data: unknown, space = 2): void {
  writeTextAtomic(filePath, JSON.stringify(data, null, space) + "\n");
}
