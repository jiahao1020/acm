import * as fs from "fs";
import { parse } from "smol-toml";
import { ConfigParseError } from "./config-error";

/**
 * Read a TOML config file (used by Codex).
 *
 * Returns null when the file is missing or empty. Throws ConfigParseError when
 * the file exists but does not parse, so callers cannot mistake a broken file
 * for an empty one and overwrite the settings it still holds.
 */
export function readTomlFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    throw new ConfigParseError(filePath, err);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigParseError(filePath, new Error("expected a TOML table"));
  }
  return parsed as Record<string, unknown>;
}
