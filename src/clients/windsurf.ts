import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { mergeServerEntry } from "../utils/merge-server";
import {
  ClientAdapter,
  McpConfig,
  McpServerConfig,
  OptionalCapability,
} from "../types";

export class WindsurfAdapter implements ClientAdapter {
  id = "windsurf";
  displayName = "Windsurf";

  getConfigPath(): string | null {
    const p = path.join(homeDir(), ".codeium", "windsurf", "mcp.json");
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
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
    const p = this.getConfigPath();
    if (!p) {
      const dir = path.join(homeDir(), ".codeium", "windsurf");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const newPath = path.join(dir, "mcp.json");
      writeJsonFile(newPath, { mcpServers: config.mcpServers });
      return;
    }
    const existing = readJsonFile(p) ?? {};
    const prior = (existing.mcpServers as Record<string, McpServerConfig>) ?? {};
    const next: Record<string, McpServerConfig> = {};
    for (const [name, server] of Object.entries(config.mcpServers)) {
      next[name] = mergeServerEntry(prior[name], server);
    }
    writeJsonFile(p, { ...existing, mcpServers: next });
  }

  supportsRemote(): boolean {
    return true;
  }

  /** command + args + env; Windsurf's schema has no `cwd` or `disabled` key. */
  capabilities(): readonly OptionalCapability[] {
    return ["env"];
  }
}
