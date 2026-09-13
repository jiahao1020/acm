/**
 * The "fan a change out to a set of clients" shape, shared by every command.
 *
 * Four commands (`mcp add`, `mcp remove`, `key apply`, `skill install`) each
 * hand-rolled the same loop: try the operation, print ✓ with the client's name,
 * catch and print ✗ with the message, then count. The copies had already
 * drifted — some counted a success before the write, one did not count at all —
 * so the loop lives here and the per-client decision stays with the caller.
 */
import chalk from "chalk";
import { errorMessage } from "./cli-helpers";

/**
 * What a single client did, from the caller's perspective.
 *
 * Returning a verdict rather than throwing keeps a client-specific decision
 * (a name conflict, an unsupported feature) out of the error path, so the
 * caller can distinguish "skipped on purpose" from "failed".
 */
export type Outcome =
  | { status: "done"; detail?: string }
  | { status: "unchanged"; detail?: string }
  | { status: "skipped"; reason: string }
  | { status: "conflict"; reason: string };

/** Tally over a fan-out run. */
export interface FanOutCounts {
  done: number;
  unchanged: number;
  skipped: number;
  conflict: number;
  failed: number;
}

export interface FanOutOptions {
  /** Print `→ … would …` lines instead of writing. */
  dryRun?: boolean;
  /** Prefix for a dry-run heading, e.g. "no files written". */
  dryRunHeading?: string;
}

/**
 * Run `act` against every client, printing one line per client and counting
 * the outcomes. An exception from `act` fails that client only — one locked
 * config must not abort the remaining clients.
 */
export function fanOut<T extends { displayName: string }>(
  clients: T[],
  act: (client: T) => Outcome,
  opts: FanOutOptions = {}
): FanOutCounts {
  const counts: FanOutCounts = { done: 0, unchanged: 0, skipped: 0, conflict: 0, failed: 0 };
  if (opts.dryRun) {
    console.log(chalk.bold(`\nDry-run — ${opts.dryRunHeading ?? "no files written"}:\n`));
  }

  for (const client of clients) {
    let outcome: Outcome;
    try {
      outcome = act(client);
    } catch (err: unknown) {
      console.log(`  ${chalk.red("✗")} ${client.displayName}  ${chalk.dim(errorMessage(err))}`);
      counts.failed++;
      continue;
    }

    const name = client.displayName;
    const detail = (text?: string) => (text ? `  ${chalk.dim(text)}` : "");
    switch (outcome.status) {
      case "done":
        // In a dry run nothing was written, so a ✓ would overstate what
        // happened; the arrow says "this is what would change".
        if (opts.dryRun) console.log(`  ${chalk.blue("→")} ${name}${detail(outcome.detail)}`);
        else console.log(`  ${chalk.green("✓")} ${name}${detail(outcome.detail)}`);
        counts.done++;
        break;
      case "unchanged":
        console.log(`  ${chalk.dim("·")} ${name}${detail(outcome.detail ?? "already up to date")}`);
        counts.unchanged++;
        break;
      case "skipped":
        console.log(`  ${chalk.yellow("–")} ${name}${detail(outcome.reason)}`);
        counts.skipped++;
        break;
      case "conflict":
        console.log(`  ${chalk.yellow("⚠")} ${name}${detail(outcome.reason)}`);
        counts.conflict++;
        break;
    }
  }
  return counts;
}

/**
 * Join summary fragments, dropping the empty ones.
 *
 * The summaries are assembled from up to six optional counters; without this
 * every caller repeated the same chain of `(n ? \`, ${n} …\` : "")`.
 */
export function summarise(
  parts: (string | false | undefined | 0)[]
): string {
  return parts.filter((p): p is string => Boolean(p)).join(", ");
}
