import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

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
    writeJsonFile(p, { ...existing, mcpServers: config.mcpServers });
  }

  supportsRemote(): boolean {
    return true;
  }
}
