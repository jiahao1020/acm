import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

/**
 * Claude Code keeps MCP servers in more than one place depending on version:
 *   - ~/.claude.json          (main global config)
 *   - ~/.claude/mcp.json      (alternate/legacy global config)
 * We treat every existing file as a location that must stay in sync.
 */
export class ClaudeCodeAdapter implements ClientAdapter {
  id = "claude-code";
  displayName = "Claude Code";

  private candidatePaths(): string[] {
    return [
      path.join(homeDir(), ".claude.json"),
      path.join(homeDir(), ".claude", "mcp.json"),
    ];
  }

  /** All config files that currently exist. */
  private existingPaths(): string[] {
    return this.candidatePaths().filter((p) => fs.existsSync(p));
  }

  /** Primary path: the main config if present, else the alternate. */
  getConfigPath(): string | null {
    const paths = this.existingPaths();
    return paths[0] ?? null;
  }

  detect(): boolean {
    return this.existingPaths().length > 0;
  }

  readConfig(): McpConfig {
    const paths = this.existingPaths();
    if (paths.length === 0) return { mcpServers: {} };
    // Merge servers from every location; first occurrence wins.
    const merged: Record<string, McpServerConfig> = {};
    for (const p of paths) {
      const raw = readJsonFile(p);
      const servers = (raw?.mcpServers as Record<string, McpServerConfig>) ?? {};
      for (const [name, server] of Object.entries(servers)) {
        if (!(name in merged)) merged[name] = server;
      }
    }
    return { mcpServers: merged };
  }

  writeConfig(config: McpConfig): void {
    const paths = this.existingPaths();
    const targets = paths.length > 0 ? paths : [path.join(homeDir(), ".claude.json")];
    for (const p of targets) {
      const existing = readJsonFile(p) ?? {};
      writeJsonFile(p, { ...existing, mcpServers: config.mcpServers });
    }
  }

  supportsRemote(): boolean {
    return true;
  }
}
