import * as fs from "fs";
import * as path from "path";
import { homeDir } from "../utils/paths";
import { readJsonFile } from "../utils/json";
import { writeTextAtomic } from "../utils/atomic-write";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";

/**
 * ZCode stores its own MCP servers inside its CLI config file under the
 * nested key `mcp.servers`:
 *
 *   ~/.zcode/cli/config.json
 *   {
 *     "storage": { ... },
 *     "mcp": { "servers": { "<name>": { command, args, env, ... } } }
 *   }
 *
 * (Confirmed against ZCode's own client descriptor table, which declares
 *  userConfigDirSegments [".zcode","cli"], fileName "config.json" and
 *  configKeyName "mcp.servers".)
 *
 * The file also holds unrelated settings, so everything outside
 * `mcp.servers` is preserved on write.
 */
export class ZCodeAdapter implements ClientAdapter {
  id = "zcode";
  displayName = "ZCode";

  private configDir(): string {
    return path.join(homeDir(), ".zcode", "cli");
  }

  private configPath(): string {
    return path.join(this.configDir(), "config.json");
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
   * silently drop `storage` and every other setting the user has.
   */
  private readRaw(): Record<string, unknown> {
    return readJsonFile(this.configPath()) ?? {};
  }

  readConfig(): McpConfig {
    const raw = this.readRaw();
    const mcp = raw.mcp as Record<string, unknown> | undefined;
    const servers = mcp?.servers as Record<string, McpServerConfig> | undefined;
    return { mcpServers: servers ?? {} };
  }

  writeConfig(config: McpConfig): void {
    const p = this.configPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      throw new Error("ZCode directory not found. Install ZCode first.");
    }

    const raw = this.readRaw();
    const mcp =
      raw.mcp && typeof raw.mcp === "object" && !Array.isArray(raw.mcp)
        ? (raw.mcp as Record<string, unknown>)
        : {};
    mcp.servers = config.mcpServers;
    raw.mcp = mcp;

    writeTextAtomic(p, JSON.stringify(raw, null, 2) + "\n");
  }

  supportsRemote(): boolean {
    return true;
  }
}
