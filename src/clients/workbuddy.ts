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

/**
 * WorkBuddy's `mcpServers` schema is command + args + env. It has no `cwd` key,
 * so an added working directory is reported instead of dropped in silence.
 */
export class WorkbuddyAdapter implements ClientAdapter {
  id = "workbuddy";
  displayName = "Workbuddy";

  getConfigPath(): string | null {
    const p = path.join(homeDir(), ".workbuddy", "mcp.json");
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(path.join(homeDir(), ".workbuddy"));
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
      const dir = path.join(homeDir(), ".workbuddy");
      if (!fs.existsSync(dir)) {
        throw new Error("Workbuddy directory not found. Install Workbuddy first.");
      }
      writeJsonFile(path.join(dir, "mcp.json"), { mcpServers: config.mcpServers });
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

  capabilities(): readonly OptionalCapability[] {
    return ["env"];
  }
}
