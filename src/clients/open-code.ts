import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

/**
 * OpenCode uses a different schema from every other client:
 *
 *   ~/.config/opencode/opencode.json
 *   {
 *     "$schema": "https://opencode.ai/config.json",
 *     "mcp": {
 *       "<name>": {
 *         "type": "local",
 *         "command": ["npx", "-y", "pkg"],   // command AND args in one array
 *         "environment": { "KEY": "VAL" },   // not "env"
 *         "enabled": true                     // not "disabled"
 *       },
 *       "<remote>": { "type": "remote", "url": "...", "headers": {...}, "enabled": true }
 *     }
 *   }
 *
 * (Schema confirmed against @opencode-ai/sdk's McpLocalConfig / McpRemoteConfig.)
 * The `mcp` key is nested and `$schema` must survive a write.
 */
export class OpenCodeAdapter implements ClientAdapter {
  id = "opencode";
  displayName = "OpenCode";

  private configDir(): string {
    return path.join(homeDir(), ".config", "opencode");
  }

  private configPath(): string {
    return path.join(this.configDir(), "opencode.json");
  }

  getConfigPath(): string | null {
    const p = this.configPath();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(this.configDir());
  }

  /**
   * The whole file, so unrelated keys survive a write.
   *
   * A missing file is a legitimate empty config, but an unparseable one must
   * throw: `writeConfig` merges into this object, so falling back to `{}` would
   * silently drop the user's other settings.
   */
  private readRaw(): Record<string, unknown> {
    return readJsonFile(this.configPath()) ?? {};
  }

  readConfig(): McpConfig {
    const raw = this.readRaw();
    const mcp = raw.mcp as Record<string, unknown> | undefined;
    if (!mcp || typeof mcp !== "object") return { mcpServers: {} };

    const mcpServers: Record<string, McpServerConfig> = {};
    for (const [name, entry] of Object.entries(mcp)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      mcpServers[name] = this.fromOpenCode(entry as Record<string, unknown>);
    }
    return { mcpServers };
  }

  /** OpenCode entry → common shape. */
  private fromOpenCode(e: Record<string, unknown>): McpServerConfig {
    const enabled = e.enabled !== false;
    const out: McpServerConfig = {};
    if (enabled === false) out.disabled = true;

    if (e.type === "remote" || typeof e.url === "string") {
      if (typeof e.url === "string") out.url = e.url;
      if (e.headers && typeof e.headers === "object") {
        out.headers = e.headers as Record<string, string>;
      }
      return out;
    }

    const cmd = e.command;
    if (Array.isArray(cmd)) {
      const parts = cmd.filter((x): x is string => typeof x === "string");
      if (parts.length > 0) {
        out.command = parts[0];
        out.args = parts.slice(1);
      }
    } else if (typeof cmd === "string") {
      out.command = cmd;
    }

    if (e.environment && typeof e.environment === "object") {
      out.env = e.environment as Record<string, string>;
    }
    return out;
  }

  /** Common shape → OpenCode entry. */
  private toOpenCode(s: McpServerConfig): Record<string, unknown> {
    const enabled = s.disabled !== true;
    if (typeof s.url === "string") {
      const out: Record<string, unknown> = { type: "remote", url: s.url, enabled };
      if (s.headers) out.headers = s.headers;
      return out;
    }
    const command = [s.command, ...(s.args ?? [])].filter(
      (x): x is string => typeof x === "string"
    );
    const out: Record<string, unknown> = { type: "local", command, enabled };
    if (s.env) out.environment = s.env;
    return out;
  }

  writeConfig(config: McpConfig): void {
    const p = this.configPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      throw new Error(`OpenCode directory not found: ${dir}`);
    }

    const raw = this.readRaw();
    const mcp: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(config.mcpServers)) {
      mcp[name] = this.toOpenCode(server);
    }
    raw.mcp = mcp;
    if (typeof raw.$schema !== "string") {
      raw.$schema = "https://opencode.ai/config.json";
    }

    writeTextAtomic(p, JSON.stringify(raw, null, 2) + "\n");
  }

  supportsRemote(): boolean {
    return true;
  }
}
