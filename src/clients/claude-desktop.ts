import * as fs from "fs";
import * as path from "path";
import { appDataDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { mergeServersMap } from "../utils/merge-server";
import { ClientAdapter, McpConfig, McpServerConfig, OptionalCapability } from "../types";

export class ClaudeDesktopAdapter implements ClientAdapter {
  id = "claude-desktop";
  displayName = "Claude Desktop";

  getConfigPath(): string | null {
    const p = path.join(appDataDir(), "Claude", "claude_desktop_config.json");
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
      // Create config file if Claude Desktop directory exists
      const dir = path.join(appDataDir(), "Claude");
      if (!fs.existsSync(dir)) {
        throw new Error(
          `Claude Desktop directory not found: ${dir}\nInstall Claude Desktop first.`
        );
      }
      const newPath = path.join(dir, "claude_desktop_config.json");
      writeJsonFile(newPath, config);
      return;
    }
    // Preserve any non-mcpServers top-level keys, and any per-entry keys the
    // common model does not know about.
    const existing = readJsonFile(p) ?? {};
    const prior = (existing.mcpServers as Record<string, McpServerConfig>) ?? {};
    writeJsonFile(p, {
      ...existing,
      mcpServers: mergeServersMap(prior, config.mcpServers),
    });
  }

  /** Claude Desktop launches stdio servers only, so remote entries are skipped. */
  supportsRemote(): boolean {
    return false;
  }

  /**
   * Claude Desktop's schema is command + args + env only. There is no `cwd`
   * key, so passing one is reported rather than dropped silently.
   */
  capabilities(): readonly OptionalCapability[] {
    return ["env"];
  }
}
