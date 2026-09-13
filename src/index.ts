import { Command } from "commander";
import { initCommand } from "./commands/init";
import { createMcpCommand } from "./commands/mcp";
import { createKeyCommand } from "./commands/key";
import { createSkillCommand } from "./commands/skill";
import { ConfigParseError } from "./utils/config-error";

/**
 * Version injected at build time by tsup (`define`), so it can never drift from
 * the release and never depends on package.json being reachable at runtime.
 *
 * The previous runtime lookup joined `__dirname/../package.json`, which points
 * outside the package when the file is executed from `src/`, and silently
 * degraded to "0.0.0" — a wrong version in bug reports is worse than a missing
 * one, so there is no filesystem fallback here.
 */
const VERSION = process.env.ACM_VERSION ?? "0.0.0";

const program = new Command();

program
  .name("acm")
  .description(
    "Agent Config Manager — sync MCP servers, API gateway config and skills across AI agent clients"
  )
  .version(VERSION)
  .enablePositionalOptions();

program
  .command("init")
  .description("Detect installed AI agent clients and select which to manage")
  .action(initCommand);

program.addCommand(createMcpCommand());
program.addCommand(createKeyCommand());
program.addCommand(createSkillCommand());

// Every action is async, so the program must be awaited: with the synchronous
// parse() a rejected action becomes an unhandled rejection — a raw stack trace
// with no chance to explain what went wrong.
program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  ✗ ${message}\n`);
  if (err instanceof ConfigParseError) {
    console.error("  Fix or remove that file, then retry.\n");
  }
  process.exitCode = 1;
});
