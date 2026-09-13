import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ApiConfigAdapter } from "./api-adapter";

/**
 * OpenCode stores API providers at ~/.config/opencode/opencode.json:
 *   {
 *     "$schema": "https://opencode.ai/config.json",
 *     "mcp": { ... },
 *     "provider": {
 *       "<name>": {
 *         "npm": "@ai-sdk/openai-compatible",
 *         "models": {},
 *         "options": { "apiKey": "...", "baseURL": "..." }
 *       }
 *     }
 *   }
 */
export class OpenCodeApiAdapter implements ApiConfigAdapter {
  id = "opencode";
  displayName = "OpenCode";

  private configPath_(): string {
    return path.join(homeDir(), ".config", "opencode", "opencode.json");
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

    // Fallback: first provider with a valid baseURL
    for (const [, entry] of Object.entries(providers)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const opts = e.options as Record<string, unknown> | undefined;
      if (!opts) continue;
      const baseUrl = typeof opts.baseURL === "string" ? opts.baseURL : undefined;
      const apiKey = typeof opts.apiKey === "string" ? opts.apiKey : undefined;
      if (baseUrl) return { baseUrl, apiKey };
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
      npm: "@ai-sdk/openai-compatible",
      models: {},
      options: { apiKey: cfg.apiKey, baseURL: cfg.baseUrl },
    };
    existing.provider = providers;

    writeTextAtomic(p, JSON.stringify(existing, null, 2) + "\n");
  }
}
