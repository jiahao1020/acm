import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ApiConfigAdapter } from "./api-adapter";

/**
 * ZCode stores API providers at ~/.zcode/v2/config.json under the nested
 * `provider` key:
 *   {
 *     "provider": {
 *       "<name>": {
 *         "name": "...",
 *         "kind": "openai-compatible",
 *         "options": { "apiKey": "...", "baseURL": "..." },
 *         "enabled": true,
 *         "source": "custom",
 *         "models": {}
 *       }
 *     }
 *   }
 */
export class ZCodeApiAdapter implements ApiConfigAdapter {
  id = "zcode";
  displayName = "ZCode";

  private configPath_(): string {
    return path.join(homeDir(), ".zcode", "v2", "config.json");
  }

  getConfigPath(): string | null {
    const p = this.configPath_();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(this.configPath_());
  }

  readGateway(providerName?: string): { baseUrl?: string; apiKey?: string } | null {
    const p = this.getConfigPath();
    if (!p) return null;
    const raw = readJsonFile(p) as Record<string, unknown> | null;
    const providers = raw?.provider as Record<string, unknown> | undefined;
    if (!providers) return null;

    // If providerName given, check that entry first
    if (providerName && providers[providerName]) {
      const e = providers[providerName] as Record<string, unknown>;
      const opts = e.options as Record<string, unknown> | undefined;
      if (opts) {
        const baseUrl = typeof opts.baseURL === "string" ? opts.baseURL : undefined;
        const apiKey = typeof opts.apiKey === "string" ? opts.apiKey : undefined;
        if (baseUrl) return { baseUrl, apiKey };
      }
    }

    // Fallback: first enabled provider with a valid baseURL
    for (const [, entry] of Object.entries(providers)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const opts = e.options as Record<string, unknown> | undefined;
      if (!opts) continue;
      const baseUrl = typeof opts.baseURL === "string" ? opts.baseURL : undefined;
      const apiKey = typeof opts.apiKey === "string" ? opts.apiKey : undefined;
      if (baseUrl && e.enabled !== false) return { baseUrl, apiKey };
    }
    return null;
  }

  writeGateway(cfg: {
    baseUrl: string;
    apiKey: string;
    providerName: string;
  }): void {
    const p = this.configPath_();
    const existing = (readJsonFile(p) ?? {}) as Record<string, unknown>;
    const providers =
      existing.provider &&
      typeof existing.provider === "object" &&
      !Array.isArray(existing.provider)
        ? (existing.provider as Record<string, unknown>)
        : {};

    providers[cfg.providerName] = {
      name: cfg.providerName,
      kind: "openai-compatible",
      options: { apiKey: cfg.apiKey, baseURL: cfg.baseUrl },
      enabled: true,
      source: "custom",
      models: {},
    };
    existing.provider = providers;

    writeTextAtomic(p, JSON.stringify(existing, null, 2) + "\n");
  }
}
