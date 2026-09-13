import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ApiConfigAdapter } from "./api-adapter";
import { readProviderGateway, alwaysUsable } from "./provider-gateway";

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
    // OpenCode providers carry no `enabled` flag, so any with a baseURL counts.
    return readProviderGateway(raw, providerName, alwaysUsable);
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
