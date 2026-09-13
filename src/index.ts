import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { initCommand } from "./commands/init";
import { createMcpCommand } from "./commands/mcp";
import { createKeyCommand } from "./commands/key";
import { createSkillCommand } from "./commands/skill";
import { ConfigParseError } from "./utils/config-error";

/** Version read from the installed package.json so it cannot drift from the release. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("acm")
  .description(
    "Agent Config Manager — sync MCP servers, API gateway config and skills across AI agent clients"
  )
  .version(readVersion())
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
