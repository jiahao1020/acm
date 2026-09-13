import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ApiConfigAdapter } from "./api-adapter";
import { readProviderGateway, enabledOnly } from "./provider-gateway";

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
    // A provider the user turned off must not be reported as the active gateway.
    return readProviderGateway(raw, providerName, enabledOnly);
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
