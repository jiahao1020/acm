import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { mergeServersMap } from "../utils/merge-server";
import {
  ClientAdapter,
  McpConfig,
  McpServerConfig,
  OptionalCapability,
} from "../types";

export class CursorAdapter implements ClientAdapter {
  id = "cursor";
  displayName = "Cursor";

  getConfigPath(): string | null {
    const p = path.join(homeDir(), ".cursor", "mcp.json");
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
      const dir = path.join(homeDir(), ".cursor");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const newPath = path.join(dir, "mcp.json");
      writeJsonFile(newPath, { mcpServers: config.mcpServers });
      return;
    }
    const existing = readJsonFile(p) ?? {};
    const prior = (existing.mcpServers as Record<string, McpServerConfig>) ?? {};
    writeJsonFile(p, {
      ...existing,
      mcpServers: mergeServersMap(prior, config.mcpServers),
    });
  }

  supportsRemote(): boolean {
    return true;
  }

  /**
   * Cursor's `mcpServers` schema is command + args + env. There is no `cwd`
   * key, so passing one is reported rather than dropped in silence.
   */
  capabilities(): readonly OptionalCapability[] {
    return ["env"];
  }
}
