import * as fs from "fs";
import { parse, stringify } from "yaml";
import { ConfigParseError } from "./config-error";

/**
 * Read a YAML config file (used by Hermes).
 *
 * Mirrors `readTomlFile` deliberately: returns null when the file is missing or
 * empty, and throws ConfigParseError when it exists but does not parse. Hermes
 * keeps its whole settings tree in one `config.yaml`, so degrading a parse
 * failure to "empty config" would drop the model, providers, toolset and cron
 * configuration on the next write.
 */
export function readYamlFile(filePath: string): Record<string, unknown> | null {
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
    throw new ConfigParseError(filePath, new Error("expected a YAML mapping"));
  }
  return parsed as Record<string, unknown>;
}

/**
 * Serialise a YAML document.
 *
 * `lineWidth: 0` disables folding, so a long command path stays on one line
 * instead of being wrapped at 80 columns — the file is read by hand often
 * enough that a wrapped path is worse than a long line.
 */
export function stringifyYaml(value: unknown): string {
  return stringify(value, { lineWidth: 0 });
}
