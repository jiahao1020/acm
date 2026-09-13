import * as fs from "fs";
import { readJsonFile, writeJsonFile } from "./json";
import { ConfigParseError } from "./config-error";
import { acmConfigPath } from "./paths";

/**
 * acm's own settings live in ~/.acm/config.json. Several commands write to it
 * (init saves the client selection, key set-gateway saves the gateway), so all
 * writes must go through here — a plain overwrite would drop other sections.
 */

export interface GatewayConfig {
  url: string;
  key: string;
  providerName: string;
}

export interface AcmConfig {
  /** Client ids selected during `acm init`. Empty/absent means "all detected". */
  clients?: string[];
  gateway?: GatewayConfig;
  [key: string]: unknown;
}

/**
 * Read the whole acm config, tolerating a missing or malformed file.
 *
 * This is acm's own file rather than a client's, so a corrupt copy degrades to
 * defaults (all detected clients) instead of blocking every command.
 */
export function readAcmConfig(): AcmConfig {
  let raw: Record<string, unknown> | null;
  try {
    raw = readJsonFile(acmConfigPath());
  } catch (err: unknown) {
    if (err instanceof ConfigParseError) return {};
    throw err;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as AcmConfig;
}

/**
 * Merge `patch` into the stored config, preserving every other key.
 * A `null` value deletes that key.
 */
export function updateAcmConfig(patch: Record<string, unknown>): void {
  const next: Record<string, unknown> = { ...readAcmConfig() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }

  const path = acmConfigPath();
  writeJsonFile(path, next);
  restrictToOwner(path);
}

/** Client ids chosen during `acm init`, or [] when never configured. */
export function getSelectedClientIds(): string[] {
  const ids = readAcmConfig().clients;
  return Array.isArray(ids) ? (ids as string[]) : [];
}

/**
 * Narrow adapters to the clients selected during `acm init`.
 * With no selection saved, every detected client is kept.
 */
export function applyClientSelection<T extends { id: string }>(
  adapters: T[]
): T[] {
  const ids = getSelectedClientIds();
  if (ids.length === 0) return adapters;
  return adapters.filter((a) => ids.includes(a.id));
}

/** The acm config holds a raw API key, so keep it readable only by its owner. */
function restrictToOwner(path: string): void {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(path, 0o600);
  } catch {
    // Filesystems without POSIX permissions — nothing to do.
  }
}
