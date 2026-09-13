import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { mcpList } from "../commands/mcp";
import { captureOutput, withExitCode, withFakeHome } from "./helpers";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

/**
 * `acm mcp list` used to abort on the first unparseable config, hiding every
 * healthy client's servers too. These cases pin the recovery behaviour.
 */

test("mcp list shows healthy clients even when another config is unparseable", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { filesystem: { command: "npx", args: ["-y", "fs"] } } })
    );
    // ZCode: valid config holding a server, plus a second client that is broken.
    write(
      path.join(home, ".zcode", "cli", "config.json"),
      '{ "storage": { "token": "KEEP" }'
    );

    const exitCode = await withExitCode(async () => {
      const out = await captureOutput(() => mcpList());
      // The healthy server must still be listed.
      assert.match(out, /filesystem/, "healthy client's server must be shown");
      assert.match(out, /npx -y fs/);
      // The broken client is reported as unknown, not as "not configured".
      assert.match(out, /config unreadable/);
      assert.doesNotMatch(out, /not configured/);
      // And the reason is surfaced, without the raw stack trace.
      assert.match(out, /Could not read|unreadable config/);
      assert.match(out, /Cannot parse/);
    });

    assert.equal(exitCode, 1, "an unreadable config must set a non-zero exit code");
  });
});

test("mcp list reports 'not configured' for a healthy client that genuinely lacks the server", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { filesystem: { command: "npx" } } })
    );
    // Windsurf config exists and parses, but holds no servers.
    write(
      path.join(home, ".codeium", "windsurf", "mcp.json"),
      JSON.stringify({ mcpServers: {} })
    );

    const exitCode = await withExitCode(async () => {
      const out = await captureOutput(() => mcpList());
      assert.match(out, /filesystem/);
      assert.match(out, /not configured/, "a readable client without the server is 'not configured'");
      assert.doesNotMatch(out, /config unreadable/);
    });

    assert.equal(exitCode, undefined, "no failure means no exit code override");
  });
});

test("mcp list exits non-zero when every config is unreadable", async () => {
  await withFakeHome(async (home) => {
    write(path.join(home, ".zcode", "cli", "config.json"), '{ "storage": {');
    write(path.join(home, ".config", "opencode", "opencode.json"), '{ "mcp": {');

    const exitCode = await withExitCode(async () => {
      const out = await captureOutput(() => mcpList());
      assert.match(out, /Cannot parse/);
    });

    assert.equal(exitCode, 1);
  });
});
