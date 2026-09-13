import * as fs from "fs";
import * as path from "path";
import { hermesHome } from "../utils/paths";
import { readYamlFile, stringifyYaml } from "../utils/yaml";
import { writeTextAtomic } from "../utils/atomic-write";
import { mergeServerEntry } from "../utils/merge-server";
import {
  ClientAdapter,
  McpConfig,
  McpServerConfig,
  OptionalCapability,
} from "../types";

/**
 * Hermes spells the on/off switch `enabled: false`, where acm's common model
 * spells it `disabled: true`. Without this translation `acm mcp add --disabled`
 * would write a key Hermes never reads and the server would stay live — the
 * same silent-drop failure the capability matrix exists to prevent, just with
 * the polarity reversed rather than a missing field.
 *
 * An entry with no `enabled` key at all is enabled (Hermes' default), so the
 * absence of the key reads as `disabled: false` rather than "unknown".
 */
function fromHermesEntry(raw: Record<string, unknown>): McpServerConfig {
  const { enabled, ...rest } = raw;
  const server = rest as McpServerConfig;
  if (enabled === false) server.disabled = true;
  return server;
}

/**
 * The inverse, applied on write.
 *
 * `onDisk` is the entry as it was found, and it decides how to express the
 * toggle: an existing `enabled` key is updated in place (keeping it where the
 * user's file already had it, and for an entry that was disabled, keeping it
 * disabled), while an entry that never had one is left without the key unless
 * it is being explicitly disabled. Writing `enabled: true` onto every entry
 * would reformat a file full of servers that were fine as they were.
 */
function toHermesEntry(
  merged: McpServerConfig,
  onDisk: Record<string, unknown> | undefined
): Record<string, unknown> {
  const { disabled, ...rest } = merged;
  const out: Record<string, unknown> = { ...rest };

  if (disabled === true) out.enabled = false;
  else if (onDisk && "enabled" in onDisk) out.enabled = true;
  else delete out.enabled;

  return out;
}

/**
 * Hermes Agent stores MCP servers in YAML, as the `mcp_servers` mapping of its
 * single `config.yaml`:
 *
 *   mcp_servers:
 *     sql-ops:
 *       enabled: true
 *       timeout: 180
 *       connect_timeout: 30
 *       command: D:\...\python.exe
 *       args:
 *         - -m
 *         - sql_ops_mcp
 *     ima-mcp:
 *       enabled: false
 *       url: https://ima.qq.com/mcp
 *
 * Two things set this apart from the JSON clients. The file is YAML, so it is
 * read and written through `utils/yaml.ts` rather than `JSON.parse`. And
 * `config.yaml` is not an MCP file with extra keys — it is Hermes' *entire*
 * settings tree* (model, providers, toolsets, cron, dashboard, …), of which
 * `mcp_servers` is one branch. A read-modify-write that dropped the rest would
 * destroy the installation, which is what `readYamlFile` throwing on a parse
 * failure is protecting against.
 *
 * Hermes' own `hermes mcp add` was not used instead: it is discovery-first, so
 * it connects to the server and enumerates its tools before writing — slow, and
 * it fails outright for a server that is not currently reachable. Writing the
 * config directly keeps acm's atomic-write and backup guarantees, which is the
 * whole point of routing through acm.
 */
export class HermesAdapter implements ClientAdapter {
  id = "hermes";
  displayName = "Hermes";

  private configDir(): string {
    return hermesHome();
  }

  private configPath(): string {
    return path.join(this.configDir(), "config.yaml");
  }

  getConfigPath(): string | null {
    const p = this.configPath();
    return fs.existsSync(p) ? p : null;
  }

  detect(): boolean {
    return fs.existsSync(this.configPath());
  }

  readConfig(): McpConfig {
    const raw = readYamlFile(this.configPath());
    const servers = raw?.mcp_servers as Record<string, unknown> | undefined;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
      return { mcpServers: {} };
    }

    const mcpServers: Record<string, McpServerConfig> = {};
    for (const [name, val] of Object.entries(servers)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        mcpServers[name] = fromHermesEntry(val as Record<string, unknown>);
      }
    }
    return { mcpServers };
  }

  writeConfig(config: McpConfig): void {
    const p = this.configPath();
    if (!fs.existsSync(p)) {
      throw new Error("Hermes config.yaml not found. Install Hermes Agent first.");
    }

    // readYamlFile keeps every unrelated branch (model, providers, toolsets,
    // cron, …) and refuses to touch a file it cannot parse.
    const parsed = readYamlFile(p) ?? {};
    const prior = (parsed.mcp_servers as Record<string, McpServerConfig>) ?? {};

    // `config.mcpServers` is the desired state, not a patch: `acm mcp remove`
    // works by omitting a key, so taking the union with what is on disk would
    // silently undo every deletion. Entries still present are merged per-key so
    // Hermes-only fields (`timeout`, tool selection) survive a rewrite; entries
    // absent from `config` are gone on purpose.
    //
    // Translation happens against the on-disk entry so the inverted
    // `disabled`/`enabled` pair is resolved in Hermes' vocabulary.
    const incoming: Record<string, McpServerConfig> = {};
    for (const [name, server] of Object.entries(config.mcpServers)) {
      const existing = prior[name];
      const merged = mergeServerEntry(
        existing ? fromHermesEntry(existing) : undefined,
        server
      );
      incoming[name] = toHermesEntry(merged, existing);
    }

    parsed.mcp_servers = incoming;
    writeTextAtomic(p, stringifyYaml(parsed));
  }

  supportsRemote(): boolean {
    return true;
  }

  /**
   * Hermes models `disabled` as `enabled` (inverted) and additionally stores
   * `timeout` / `connect_timeout`, none of which acm sets. The four common
   * optional fields all have somewhere to live, and everything else the entry
   * carries is preserved by the merge.
   */
  capabilities(): readonly OptionalCapability[] {
    return ["cwd", "env", "headers", "disabled"];
  }
}
