import { Command } from "commander";
import chalk from "chalk";
import * as prompts from "@clack/prompts";
import { getSelectedAdapters } from "../clients/registry";
import { ClientAdapter, McpConfig, McpServerConfig } from "../types";
import { errorMessage, resolveTargets as resolveClientTargets } from "../utils/cli-helpers";
import { fanOut, summarise } from "../utils/fan-out";
import { unsupportedFields } from "../utils/merge-server";
import { column } from "../utils/ui";
import { AddArgs, parseAddArgs, rawAddTokens } from "./add-args";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const resolveTargets = (clientOpt?: string): ClientAdapter[] | null =>
  resolveClientTargets(getSelectedAdapters(), clientOpt);

function serverSummary(s: McpServerConfig): string {
  if (s.url) return chalk.cyan(`[remote] ${s.url}`);
  const cmd = [s.command, ...(s.args ?? [])].join(" ");
  return chalk.dim(cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd);
}

/**
 * Compare two server entries ignoring key order, so re-adding an identical
 * server can be reported as "up to date" rather than a conflict.
 */
function sameServer(a: McpServerConfig, b: McpServerConfig): boolean {
  return canonical(a) === canonical(b);
}

/**
 * Stable string form of a server entry, used for structural comparison.
 *
 * `undefined` properties are dropped rather than serialised: JSON.stringify
 * returns the *undefined value* (not a string) for them, so `{a: undefined}`
 * and `{}` would compare unequal. The two are equivalent here — the adapters
 * never write an undefined field out — and treating them as different made a
 * re-add of an identical server report a conflict and demand `--force`.
 *
 * Exported for tests: this is the equivalence rule behind the `--force`
 * conflict check.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/* ------------------------------------------------------------------ */
/*  acm mcp list                                                      */
/* ------------------------------------------------------------------ */

/** Exported for tests: `list` must survive a client whose config won't parse. */
export async function mcpList(): Promise<void> {
  const clients = getSelectedAdapters();
  if (clients.length === 0) {
    prompts.log.warn("No clients tracked. Run `acm init` first.");
    return;
  }

  // A config file that cannot be parsed must not take the whole listing down
  // with it: the other clients' servers are still worth showing, and the user
  // needs to see exactly which file to fix. Mirrors mcpSync's handling.
  const serverMap = new Map<string, Map<string, McpServerConfig>>();
  const unreadable: string[] = [];
  const brokenIds = new Set<string>();
  for (const client of clients) {
    let cfg: McpConfig;
    try {
      cfg = client.readConfig();
    } catch (err: unknown) {
      unreadable.push(`${client.displayName} (${errorMessage(err)})`);
      brokenIds.add(client.id);
      continue;
    }
    for (const [name, server] of Object.entries(cfg.mcpServers)) {
      if (!serverMap.has(name)) serverMap.set(name, new Map());
      serverMap.get(name)!.set(client.id, server);
    }
  }

  if (serverMap.size === 0) {
    if (unreadable.length > 0) {
      prompts.log.error(`Could not read: ${unreadable.join("; ")}`);
      prompts.log.info("Fix or remove the file(s) above, then retry.");
      process.exitCode = 1;
    } else {
      prompts.log.info("No MCP servers configured in any tracked client.");
    }
    return;
  }

  console.log(
    chalk.bold(`\nMCP Servers across ${clients.length} client(s):\n`)
  );

  // One width for the whole table, measured from the clients actually being
  // printed, so every server block lines up regardless of display names.
  const label = column(clients, (c) => c.displayName);
  for (const [name, clientServers] of serverMap) {
    console.log(chalk.bold.yellow(`  ${name}`));
    for (const client of clients) {
      const server = clientServers.get(client.id);
      if (server) {
        console.log(
          `    ${chalk.green("✓")} ${label(client)} ${serverSummary(server)}`
        );
      } else if (brokenIds.has(client.id)) {
        // Unknown, not absent: saying "not configured" would be a lie.
        console.log(
          `    ${chalk.yellow("?")} ${label(client)} ${chalk.dim("config unreadable")}`
        );
      } else {
        console.log(
          `    ${chalk.red("✗")} ${label(client)} ${chalk.dim("not configured")}`
        );
      }
    }
    console.log();
  }

  if (unreadable.length > 0) {
    prompts.log.warn(
      `Skipped ${unreadable.length} client(s) with unreadable config: ${unreadable.join("; ")}`
    );
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */
/*  acm mcp add                                                       */
/* ------------------------------------------------------------------ */

async function mcpAdd(args: AddArgs): Promise<void> {
  if (args.errors.length > 0) {
    for (const problem of args.errors) prompts.log.error(problem);
    prompts.log.info("Example: acm mcp add my-server npx -y some-package");
    process.exitCode = 1;
    return;
  }

  if (!args.name) {
    prompts.log.error("Server name is required.");
    prompts.log.info("Example: acm mcp add my-server npx -y some-package");
    process.exitCode = 1;
    return;
  }

  const targets = resolveTargets(args.client);
  if (!targets) return;
  if (targets.length === 0) {
    prompts.log.warn("No matching clients found. Run `acm init` first.");
    process.exitCode = 1;
    return;
  }

  const server: McpServerConfig = {};
  if (args.url) {
    server.url = args.url;
    // `type` is intentionally not set here: it is derived from `url` by the
    // adapters that need it (OpenCode writes `type: "remote"` itself) and is
    // ignored by every other client. Setting it here made it look like part of
    // the common model while no adapter read it, so it was dropped in silence.
  } else if (args.command.length > 0) {
    server.command = args.command[0];
    server.args = args.command.slice(1);
  } else {
    prompts.log.error("Provide a command or use --url for a remote server.");
    prompts.log.info("Example: acm mcp add my-server npx -y some-package");
    prompts.log.info("Example: acm mcp add my-server --url https://example.com/mcp");
    process.exitCode = 1;
    return;
  }

  if (args.cwd) server.cwd = args.cwd;

  if (args.env.length > 0) {
    server.env = {};
    for (const pair of args.env) {
      const idx = pair.indexOf("=");
      if (idx === -1) {
        prompts.log.warn(`Skipping invalid env var (expected KEY=VALUE): ${pair}`);
        continue;
      }
      server.env[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }

  /** Clients that took the server but cannot store one of the given fields. */
  const warned: string[] = [];

  const counts = fanOut(
    targets,
    (client) => {
      // A remote server cannot be expressed by clients that only speak stdio.
      if (args.url && !client.supportsRemote()) {
        return { status: "skipped", reason: "does not support remote (HTTP) servers" };
      }

      const cfg = client.readConfig();
      const existing = cfg.mcpServers[args.name];

      if (existing && sameServer(existing, server)) return { status: "unchanged" };
      if (existing && !args.force) {
        return {
          status: "conflict",
          reason: "already exists with different settings — use --force to overwrite",
        };
      }
      if (args.dryRun) {
        return { status: "done", detail: existing ? "would overwrite" : "would add" };
      }

      cfg.mcpServers[args.name] = server;
      client.writeConfig(cfg);

      // Fields this client's schema has no place for were written and will be
      // ignored by the client; surface that instead of silently losing them.
      const dropped = unsupportedFields(server, client.capabilities?.());
      if (dropped.length > 0) {
        warned.push(`${client.displayName} (${dropped.join(", ")})`);
      }
      return { status: "done" };
    },
    { dryRun: args.dryRun }
  );

  const { done: written, unchanged, conflict: conflicts, skipped, failed } = counts;
  const notes = summarise([
    unchanged ? `${unchanged} already up to date` : "",
    conflicts ? `${conflicts} conflicting` : "",
    warned.length > 0 ? `${warned.length} with unsupported fields` : "",
    skipped ? `${skipped} skipped` : "",
    failed ? `${failed} failed` : "",
  ]);

  console.log();
  if (args.dryRun) {
    prompts.log.info(`Would write "${args.name}" to ${written} client(s)${notes ? `, ${notes}` : ""}.`);
    if (conflicts > 0 || failed > 0) process.exitCode = 1;
    return;
  }

  if (written > 0) {
    prompts.log.success(`Added "${args.name}" to ${written} client(s)${notes ? ` (${notes})` : ""}.`);
    if (warned.length > 0) {
      prompts.log.warn(
        `${warned.length} client(s) do not store every field: ${warned.join("; ")}. Re-run with --client to limit the targets.`
      );
    }
    if (conflicts > 0) {
      prompts.log.warn(
        `${conflicts} client(s) already have "${args.name}" with different settings — re-run with --force to overwrite.`
      );
    }
    if (failed > 0 || conflicts > 0) process.exitCode = 1;
    return;
  }

  if (conflicts > 0) {
    prompts.log.warn(
      `"${args.name}" already exists in ${conflicts} client(s) with different settings — use --force to overwrite.`
    );
  } else if (unchanged > 0) {
    prompts.log.success(`"${args.name}" is already configured as requested.`);
    return;
  } else if (skipped > 0) {
    prompts.log.warn(
      `No client accepted "${args.name}" — ${skipped} do not support remote servers.`
    );
  }
  process.exitCode = 1;
}

/* ------------------------------------------------------------------ */
/*  acm mcp remove                                                    */
/* ------------------------------------------------------------------ */

async function mcpRemove(
  name: string,
  opts: { client?: string; dryRun?: boolean }
): Promise<void> {
  const targets = resolveTargets(opts.client);
  if (!targets) return;
  if (targets.length === 0) {
    prompts.log.warn("No matching clients found. Run `acm init` first.");
    process.exitCode = 1;
    return;
  }

  const counts = fanOut(
    targets,
    (client) => {
      const cfg = client.readConfig();
      if (!cfg.mcpServers[name]) return { status: "skipped", reason: "not found" };
      if (opts.dryRun) return { status: "done", detail: "would remove" };

      delete cfg.mcpServers[name];
      client.writeConfig(cfg);
      return { status: "done", detail: "removed" };
    },
    { dryRun: opts.dryRun }
  );

  const { done: affected, skipped: missing, failed } = counts;
  console.log();
  if (opts.dryRun) {
    prompts.log.info(`Would remove "${name}" from ${affected} client(s).`);
    if (failed > 0) process.exitCode = 1;
    return;
  }
  if (affected > 0) {
    prompts.log.success(
      `Removed "${name}" from ${affected} client(s)${failed ? `, ${failed} failed` : ""}.`
    );
  } else if (failed > 0) {
    prompts.log.error(`Could not remove "${name}" — ${failed} client(s) failed.`);
  } else {
    prompts.log.warn(`Server "${name}" was not found in any client.`);
  }
  if (affected === 0 || failed > 0) process.exitCode = 1;
}

/* ------------------------------------------------------------------ */
/*  acm mcp sync                                                      */
/* ------------------------------------------------------------------ */

/** Exported for tests: `sync` must never write an unresolved server entry. */
export async function mcpSync(
  opts: { yes?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const clients = getSelectedAdapters();
  if (clients.length < 2) {
    prompts.log.warn("Need at least 2 tracked clients to sync. Run `acm init` first.");
    return;
  }

  // Read each client once: a later read would either repeat the work or, worse,
  // see a config we have already rewritten mid-run.
  const configs = new Map<string, McpConfig>();
  const unreadable: string[] = [];
  for (const client of clients) {
    try {
      configs.set(client.id, client.readConfig());
    } catch (err: unknown) {
      unreadable.push(`${client.displayName} (${errorMessage(err)})`);
    }
  }
  if (unreadable.length > 0) {
    prompts.log.error(`Could not read: ${unreadable.join("; ")}`);
    prompts.log.info("Fix or remove the file(s) above, then retry.");
    process.exitCode = 1;
    return;
  }

  const allServers = new Set<string>();
  const presence = new Map<string, Set<string>>(); // serverName → client ids
  for (const client of clients) {
    for (const name of Object.keys(configs.get(client.id)!.mcpServers)) {
      allServers.add(name);
      if (!presence.has(name)) presence.set(name, new Set());
      presence.get(name)!.add(client.id);
    }
  }

  if (allServers.size === 0) {
    prompts.log.info("No MCP servers configured anywhere. Nothing to sync.");
    return;
  }

  const inconsistencies: {
    name: string;
    has: string[];
    missing: string[];
    server: McpServerConfig;
  }[] = [];

  for (const name of allServers) {
    const presentIn = presence.get(name) ?? new Set<string>();
    const has = clients.filter((c) => presentIn.has(c.id)).map((c) => c.id);
    const missing = clients.filter((c) => !presentIn.has(c.id)).map((c) => c.id);
    if (missing.length === 0) continue;

    const sourceClient = clients.find((c) => presentIn.has(c.id));
    if (!sourceClient) continue; // nothing to copy from
    const server = configs.get(sourceClient.id)!.mcpServers[name];
    if (!server) continue;
    inconsistencies.push({ name, has, missing, server });
  }

  if (inconsistencies.length === 0) {
    prompts.log.success("All MCP servers are in sync across all clients!");
    return;
  }

  console.log(chalk.bold(`\nFound ${inconsistencies.length} inconsistent server(s):\n`));
  for (const inc of inconsistencies) {
    console.log(chalk.bold.yellow(`  ${inc.name}`));
    console.log(`    Present in : ${inc.has.map((id) => chalk.green(id)).join(", ")}`);
    console.log(`    Missing in : ${inc.missing.map((id) => chalk.red(id)).join(", ")}`);
    console.log();
  }

  // server name → the entry to push, and client id → names it is missing
  const serverByName = new Map<string, McpServerConfig>();
  const plan = new Map<string, string[]>();
  for (const inc of inconsistencies) {
    serverByName.set(inc.name, inc.server);
    for (const id of inc.missing) {
      if (!plan.has(id)) plan.set(id, []);
      plan.get(id)!.push(inc.name);
    }
  }

  if (opts.dryRun) {
    console.log(chalk.bold("\nDry-run — no files written:\n"));
    let total = 0;
    // Plan keys are client ids; pad against the same names the rest of the
    // command prints, falling back to the id for anything unresolvable.
    const nameOf = (id: string) => clients.find((c) => c.id === id)?.displayName ?? id;
    const label = column([...plan.keys()], nameOf);
    for (const [id, names] of plan) {
      total += names.length;
      console.log(
        `  ${chalk.blue("→")} ${label(id)} ${names.map((n) => chalk.yellow(n)).join(", ")}`
      );
    }
    console.log();
    prompts.log.info(`Would push ${total} server(s) to ${plan.size} client(s).`);
    return;
  }

  const action = opts.yes
    ? "push-all"
    : await prompts.select({
        message: "How would you like to sync?",
        options: [
          { value: "push-all", label: "Push all missing servers to clients that lack them" },
          { value: "cancel", label: "Do nothing" },
        ],
      });

  if (prompts.isCancel(action) || action === "cancel") {
    prompts.log.info("Sync cancelled.");
    return;
  }

  // Per server, not per client: the plan is keyed by client but the report is
  // about which servers actually landed. `fanOut` counts clients, so the
  // per-server success count is tallied inside the action and carried out in
  // `pushed` — a client whose write throws pushes nothing and is counted as
  // one failure by fanOut, which is the granularity the summary reports.
  let ok = 0;
  const counts = fanOut(
    [...plan].flatMap(([id]) => clients.filter((c) => c.id === id)),
    (client) => {
      const cfg = configs.get(client.id)!;
      // Resolve every entry before writing anything: a name missing from
      // `serverByName` would otherwise land in the config as `undefined`, which
      // JSON.stringify drops silently and TOML serialisers skip — a "pushed"
      // report for a server that was never written.
      const toWrite: [string, McpServerConfig][] = [];
      for (const name of plan.get(client.id)!) {
        const server = serverByName.get(name);
        if (!server) continue;
        toWrite.push([name, server]);
        cfg.mcpServers[name] = server;
      }
      if (toWrite.length === 0) return { status: "skipped", reason: "nothing to push" };

      client.writeConfig(cfg);
      ok += toWrite.length;
      return {
        status: "done",
        detail: toWrite.map(([n]) => n).join(", "),
      };
    }
  );

  console.log();
  if (counts.failed > 0) {
    prompts.log.warn(`Synced ${ok} server(s), ${counts.failed} client(s) failed.`);
    process.exitCode = 1;
  } else {
    prompts.log.success(`Synced ${ok} server(s).`);
  }
}

/* ------------------------------------------------------------------ */
/*  Command registration                                              */
/* ------------------------------------------------------------------ */

export function createMcpCommand(): Command {
  const mcp = new Command("mcp").description(
    "Manage MCP servers across clients"
  );

  mcp
    .command("list")
    .description("List all MCP servers across tracked clients")
    .action(mcpList);

  mcp
    .command("add")
    .description("Add an MCP server to clients")
    .argument("<name>", "Server name")
    .argument("[command...]", "Command and args for the server")
    .option("--url <url>", "Remote MCP server URL (instead of command)")
    .option("--client <ids>", "Target specific clients (comma-separated IDs)")
    .option("--cwd <dir>", "Working directory for the server process")
    .option("-e, --env <pair>", "Environment variable (KEY=VALUE), repeatable")
    .option("--force", "Overwrite an existing server of the same name")
    .option("--dry-run", "Preview changes without writing")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      // Parse raw argv ourselves so server flags such as `-y` are preserved.
      await mcpAdd(parseAddArgs(rawAddTokens(process.argv.slice(2))));
    });

  mcp
    .command("remove")
    .description("Remove an MCP server from clients")
    .argument("<name>", "Server name")
    .option("--client <ids>", "Target specific clients (comma-separated IDs)")
    .option("--dry-run", "Preview changes without writing")
    .action(async (name, opts) => {
      await mcpRemove(name, opts);
    });

  mcp
    .command("sync")
    .description("Show config differences across clients and optionally reconcile")
    .option("-y, --yes", "Sync without prompting (push all missing servers)")
    .option("--dry-run", "Preview changes without writing")
    .action(async (opts) => {
      await mcpSync(opts);
    });

  return mcp;
}
