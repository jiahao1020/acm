import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ApiConfigAdapter } from "./api-adapter";

/**
 * Claude Code stores API config at ~/.claude/config.json under the flat
 * `api` section:
 *   { "api": { "base_url": "...", "api_key": "...", "default_headers": {...} } }
 */
export class ClaudeCodeApiAdapter implements ApiConfigAdapter {
  id = "claude-code";
  displayName = "Claude Code";

  private configPath_(): string {
    return path.join(homeDir(), ".claude", "config.json");
  }

  getConfigPath(): string | null {
    const p = this.configPath_();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(this.configPath_());
  }

  readGateway(): { baseUrl?: string; apiKey?: string } | null {
    const p = this.getConfigPath();
    if (!p) return null;
    const raw = readJsonFile(p) as Record<string, unknown> | null;
    const api = raw?.api as Record<string, unknown> | undefined;
    if (!api) return null;
    const baseUrl = typeof api.base_url === "string" ? api.base_url : undefined;
    const apiKey = typeof api.api_key === "string" ? api.api_key : undefined;
    return baseUrl || apiKey ? { baseUrl, apiKey } : null;
  }

  writeGateway(cfg: { baseUrl: string; apiKey: string }): void {
    const p = this.configPath_();
    const existing = (readJsonFile(p) ?? {}) as Record<string, unknown>;
    const api =
      existing.api && typeof existing.api === "object"
        ? { ...(existing.api as Record<string, unknown>) }
        : {};
    api.base_url = cfg.baseUrl;
    api.api_key = cfg.apiKey;
    existing.api = api;

    writeTextAtomic(p, JSON.stringify(existing, null, 2) + "\n");
  }
}
