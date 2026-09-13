import * as fs from "fs";
import * as path from "path";
import { appDataDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { mergeServerEntry } from "../utils/merge-server";
import {
  ClientAdapter,
  McpConfig,
  McpServerConfig,
  OptionalCapability,
} from "../types";

/**
 * Cline stores MCP settings in VS Code's globalStorage directory.
 * Path: {APPDATA}/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
 */
export class ClineAdapter implements ClientAdapter {
  id = "cline";
  displayName = "Cline";

  private settingsDir(): string {
    return path.join(
      appDataDir(),
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings"
    );
  }

  private settingsPath(): string {
    return path.join(this.settingsDir(), "cline_mcp_settings.json");
  }

  getConfigPath(): string | null {
    const p = this.settingsPath();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    // Also detect the extension directory itself (config file may not exist yet)
    const extDir = path.join(
      appDataDir(),
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev"
    );
    if (fs.existsSync(extDir)) return true;
    return this.getConfigPath() !== null;
  }

  readConfig(): McpConfig {
    const p = this.getConfigPath();
    if (!p) return { mcpServers: {} };
    const raw = readJsonFile(p);
    if (!raw) return { mcpServers: {} };
    return {
      mcpServers: (raw.mcpServers as Record<string, McpServerConfig>) ?? {},
    };
  }

  writeConfig(config: McpConfig): void {
    const p = this.settingsPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(p)) {
      const existing = readJsonFile(p) ?? {};
      const prior = (existing.mcpServers as Record<string, McpServerConfig>) ?? {};
      const next: Record<string, McpServerConfig> = {};
      for (const [name, server] of Object.entries(config.mcpServers)) {
        next[name] = mergeServerEntry(prior[name], server);
      }
      writeJsonFile(p, { ...existing, mcpServers: next });
    } else {
      writeJsonFile(p, { mcpServers: config.mcpServers });
    }
  }

  supportsRemote(): boolean {
    return true;
  }

  /** Cline's schema is command + args + env, plus its own `disabled` flag. */
  capabilities(): readonly OptionalCapability[] {
    return ["env", "disabled"];
  }
}
