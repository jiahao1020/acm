import * as fs from "fs";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

/**
 * Shared implementation for clients that store MCP servers as a plain
 * `mcpServers` object in one or more JSON files (QwenCode, Trae, Roo, Kiro,
 * CodeBuddy, ...).
 *
 * Multiple candidate files are supported so a client that keeps its config in
 * more than one place (e.g. CodeBuddy's mcp.json and settings.json) stays
 * consistent: reads merge every existing file, writes update all of them.
 */
export abstract class StandardJsonAdapter implements ClientAdapter {
  abstract id: string;
  abstract displayName: string;

  /** Candidate config files, most-preferred first. */
  protected abstract configPaths(): string[];
  /** Directory whose existence means the client is installed. */
  protected abstract installDir(): string;

  private existingPaths(): string[] {
    return this.configPaths().filter((p) => fs.existsSync(p));
  }

  getConfigPath(): string | null {
    return this.existingPaths()[0] ?? null;
  }

  detect(): boolean {
    return fs.existsSync(this.installDir());
  }

  readConfig(): McpConfig {
    const merged: Record<string, McpServerConfig> = {};
    for (const p of this.existingPaths()) {
      const raw = readJsonFile(p);
      const servers = (raw?.mcpServers as Record<string, McpServerConfig>) ?? {};
      for (const [name, server] of Object.entries(servers)) {
        if (!(name in merged)) merged[name] = server;
      }
    }
    return { mcpServers: merged };
  }

  writeConfig(config: McpConfig): void {
    const targets = this.existingPaths();
    if (targets.length === 0) {
      const primary = this.configPaths()[0];
      const dir = path.dirname(primary);
      if (!fs.existsSync(dir)) {
        throw new Error(`${this.displayName} directory not found: ${dir}`);
      }
      writeJsonFile(primary, { mcpServers: config.mcpServers });
      return;
    }
    for (const p of targets) {
      const existing = readJsonFile(p) ?? {};
      writeJsonFile(p, { ...existing, mcpServers: config.mcpServers });
    }
  }

  supportsRemote(): boolean {
    return true;
  }
}
