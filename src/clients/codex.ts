import * as fs from "fs";
import * as path from "path";
import { stringify as stringifyToml } from "smol-toml";
import { homeDir } from "../utils/paths";
import { readTomlFile } from "../utils/toml";
import { writeTextAtomic } from "../utils/atomic-write";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

/**
 * OpenAI Codex CLI stores MCP config in TOML format at ~/.codex/config.toml.
 *
 * Example TOML:
 *   [mcp_servers]
 *   [mcp_servers.codegraph]
 *   type  = "stdio"
 *   command = "codegraph"
 *   args  = ["serve", "--mcp"]
 */
export class CodexAdapter implements ClientAdapter {
  id = "codex";
  displayName = "Codex";

  private configDir(): string {
    return path.join(homeDir(), ".codex");
  }

  private configPath(): string {
    return path.join(this.configDir(), "config.toml");
  }

  getConfigPath(): string | null {
    const p = this.configPath();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(this.configDir());
  }

  readConfig(): McpConfig {
    const raw = readTomlFile(this.configPath());
    const servers = raw?.mcp_servers as Record<string, unknown> | undefined;
    if (!servers || typeof servers !== "object") return { mcpServers: {} };

    const mcpServers: Record<string, McpServerConfig> = {};
    for (const [name, val] of Object.entries(servers)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        mcpServers[name] = val as McpServerConfig;
      }
    }
    return { mcpServers };
  }

  writeConfig(config: McpConfig): void {
    const p = this.configPath();
    if (!fs.existsSync(this.configDir())) {
      throw new Error("Codex directory not found. Install Codex CLI first.");
    }

    // readTomlFile keeps every unrelated table (model, profiles, ...) and
    // refuses to touch a file it cannot parse.
    const parsed = readTomlFile(p) ?? {};
    parsed.mcp_servers = config.mcpServers;

    writeTextAtomic(p, stringifyToml(parsed) + "\n");
  }

  supportsRemote(): boolean {
    return true;
  }
}
