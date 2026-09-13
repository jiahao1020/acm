import { Command } from "commander";
import chalk from "chalk";
import * as prompts from "@clack/prompts";
import {
  getGateway,
  setGateway,
  clearGateway,
  maskKey,
  GatewayConfig,
} from "../utils/gateway";
import { getSelectedApiAdapters } from "../key/registry";
import { ApiConfigAdapter } from "../key/api-adapter";
import { selectClientIds, unknownClientMessage } from "../utils/targets";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolve the `--client` option against detected clients.
 * Returns null (after reporting) when an id matches nothing, so callers can
 * bail out instead of acting on a silently narrowed list.
 */
function resolveTargets(clientOpt?: string): ApiConfigAdapter[] | null {
  const available = getSelectedApiAdapters();
  const { targets, unknown } = selectClientIds(available, clientOpt);
  if (unknown.length > 0) {
    prompts.log.error(unknownClientMessage(unknown, available));
    process.exitCode = 1;
    return null;
  }
  return targets;
}

/* ------------------------------------------------------------------ */
/*  acm key set-gateway                                               */
/* ------------------------------------------------------------------ */

async function keySetGateway(
  url: string,
  opts: { key?: string; name?: string }
): Promise<void> {
  if (!url) {
    prompts.log.error("Gateway URL is required.");
    prompts.log.info("Example: acm key set-gateway http://localhost:3456/v1 --key sk-xxx");
    process.exitCode = 1;
    return;
  }

  // Prefer the environment over the command line: argv is visible in `ps` and
  // in the shell history, an exported variable is not.
  const key = opts.key ?? process.env.ACM_GATEWAY_KEY ?? "";
  const providerName = opts.name ?? "omniroute";

  const cfg: GatewayConfig = { url, key, providerName };
  setGateway(cfg);

  console.log();
  console.log(chalk.bold("Gateway configured:"));
  console.log(`  URL:           ${chalk.cyan(cfg.url)}`);
  console.log(`  Key:           ${chalk.dim(maskKey(cfg.key))}`);
  console.log(`  Provider name: ${chalk.yellow(cfg.providerName)}`);
  console.log();
  prompts.log.success(`Saved to ${chalk.dim("~/.acm/config.json")}`);
  prompts.log.info(`Run ${chalk.bold("acm key apply")} to write into client configs.`);
}

/* ------------------------------------------------------------------ */
/*  acm key apply                                                     */
/* ------------------------------------------------------------------ */

async function keyApply(opts: {
  client?: string;
  dryRun?: boolean;
}): Promise<void> {
  const gw = getGateway();
  if (!gw) {
    prompts.log.warn("No gateway configured. Run `acm key set-gateway <url> --key <key>` first.");
    process.exitCode = 1;
    return;
  }

  const targets = resolveTargets(opts.client);
  if (!targets) return;
  if (targets.length === 0) {
    prompts.log.warn("No detected clients with file-based API config.");
    prompts.log.info("Supported clients: Claude Code, ZCode, OpenCode");
    process.exitCode = 1;
    return;
  }

  console.log(
    chalk.bold(`\nApplying gateway ${chalk.cyan(gw.url)} to ${targets.length} client(s):\n`)
  );

  let successCount = 0;
  let failureCount = 0;
  for (const client of targets) {
    try {
      if (opts.dryRun) {
        console.log(
          `  ${chalk.blue("→")} ${client.displayName.padEnd(18)} ${chalk.dim("[dry-run]")} ${gw.url}`
        );
      } else {
        client.writeGateway({
          baseUrl: gw.url,
          apiKey: gw.key,
          providerName: gw.providerName,
        });
        console.log(`  ${chalk.green("✓")} ${client.displayName}`);
      }
      successCount++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${chalk.red("✗")} ${client.displayName}  ${chalk.dim(msg)}`);
      failureCount++;
    }
  }

  console.log();
  if (opts.dryRun) {
    prompts.log.info(`Dry-run complete. Would apply to ${successCount} client(s).`);
  } else if (successCount > 0) {
    prompts.log.success(`Applied to ${successCount} client(s).`);
    if (failureCount > 0) process.exitCode = 1;
  } else {
    prompts.log.error("Failed to apply the gateway to any client.");
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */
/*  acm key list                                                      */
/* ------------------------------------------------------------------ */

function keyList(): void {
  const gw = getGateway();

  console.log(chalk.bold("\nGateway config:\n"));
  if (!gw) {
    console.log(chalk.dim("  (none configured)"));
    console.log();
    prompts.log.info(`Run ${chalk.bold("acm key set-gateway <url> --key <key>")} to configure.`);
    return;
  }

  console.log(`  URL:           ${chalk.cyan(gw.url)}`);
  console.log(`  Key:           ${chalk.dim(maskKey(gw.key))}`);
  console.log(`  Provider name: ${chalk.yellow(gw.providerName)}`);

  console.log(chalk.bold("\nClient status:\n"));
  const clients = getSelectedApiAdapters();
  if (clients.length === 0) {
    console.log(chalk.dim("  No clients with file-based API config detected."));
    console.log();
    return;
  }

  for (const client of clients) {
    const current = client.readGateway(gw?.providerName);
    if (current?.baseUrl) {
      const matches = current.baseUrl === gw.url;
      const marker = matches
        ? chalk.green("✓ synced")
        : chalk.yellow("⚠ different URL");
      console.log(
        `  ${marker}  ${client.displayName.padEnd(18)} ${chalk.dim(current.baseUrl)}`
      );
    } else {
      console.log(
        `  ${chalk.red("✗ not configured")}  ${client.displayName}`
      );
    }
  }
  console.log();
}

/* ------------------------------------------------------------------ */
/*  acm key clear                                                     */
/* ------------------------------------------------------------------ */

function keyClear(): void {
  const existed = clearGateway();
  if (existed) {
    prompts.log.success("Gateway config removed from acm storage.");
    prompts.log.info("Client configs are unchanged — run `acm key apply` to reset them if needed.");
  } else {
    prompts.log.info("No gateway config to clear.");
  }
}

/* ------------------------------------------------------------------ */
/*  Command registration                                              */
/* ------------------------------------------------------------------ */

export function createKeyCommand(): Command {
  const key = new Command("key").description(
    "Manage API gateway (URL + key) across clients"
  );

  key
    .command("set-gateway")
    .description("Store the gateway URL and API key")
    .argument("<url>", "Gateway base URL (e.g. http://localhost:3456/v1)")
    .option("--key <key>", "API key for the gateway (or set ACM_GATEWAY_KEY)")
    .option("--name <name>", "Provider name for ZCode/OpenCode (default: omniroute)")
    .action(async (url, opts) => {
      await keySetGateway(url, opts);
    });

  key
    .command("apply")
    .description("Write the stored gateway into client configs")
    .option("--client <ids>", "Target specific clients (comma-separated IDs)")
    .option("--dry-run", "Preview changes without writing")
    .action(async (opts) => {
      await keyApply(opts);
    });

  key
    .command("list")
    .description("Show current gateway config and per-client status")
    .action(keyList);

  key
    .command("clear")
    .description("Remove the stored gateway config")
    .action(keyClear);

  return key;
}
