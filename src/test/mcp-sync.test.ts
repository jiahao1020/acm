import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { mcpSync } from "../commands/mcp";
import { captureOutput, withExitCode, withFakeHome } from "./helpers";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function readServers(home: string, rel: string): Record<string, Record<string, unknown>> {
  const raw = JSON.parse(fs.readFileSync(path.join(home, rel), "utf8"));
  return raw.mcpServers as Record<string, Record<string, unknown>>;
}

/**
 * `mcp sync` builds its write plan from two maps walked in separate loops, then
 * looked entries up with a non-null assertion. A miss would have written
 * `mcpServers[name] = undefined` — invisible in JSON (stringify drops it) and
 * silently skipped by the TOML serialiser, yet still reported as "pushed".
 */

test("mcp sync pushes every missing server in both directions", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          shared: { command: "npx", args: ["-y", "pkg"], env: { A: "1" } },
          onlyCursor: { command: "c" },
        },
      })
    );
    write(
      path.join(home, ".workbuddy", "mcp.json"),
      JSON.stringify({ mcpServers: { onlyWb: { command: "w" } } })
    );

    const out = await captureOutput(() => mcpSync({ yes: true }));
    assert.match(out, /Synced 3 server\(s\)/);

    const cursor = readServers(home, ".cursor/mcp.json");
    const wb = readServers(home, ".workbuddy/mcp.json");

    assert.deepEqual(Object.keys(cursor).sort(), ["onlyCursor", "onlyWb", "shared"]);
    assert.deepEqual(Object.keys(wb).sort(), ["onlyCursor", "onlyWb", "shared"]);
    // The shared entry must survive the trip with its env intact.
    assert.deepEqual(wb.shared, { command: "npx", args: ["-y", "pkg"], env: { A: "1" } });
  });
});

test("mcp sync writes no undefined or null into any server entry", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { alpha: { command: "a" } } })
    );
    write(
      path.join(home, ".workbuddy", "mcp.json"),
      JSON.stringify({ mcpServers: { beta: { command: "b" } } })
    );

    await captureOutput(() => mcpSync({ yes: true }));

    for (const rel of [".cursor/mcp.json", ".workbuddy/mcp.json"]) {
      for (const [name, entry] of Object.entries(readServers(home, rel))) {
        for (const [key, value] of Object.entries(entry)) {
          assert.notEqual(
            value,
            undefined,
            `${rel}: ${name}.${key} must not be undefined`
          );
          assert.notEqual(value, null, `${rel}: ${name}.${key} must not be null`);
        }
        assert.ok(
          typeof entry.command === "string",
          `${rel}: ${name} must keep its command`
        );
      }
    }
  });
});

test("mcp sync reports nothing to do when every client already agrees", async () => {
  await withFakeHome(async (home) => {
    const servers = { mcpServers: { same: { command: "npx" } } };
    write(path.join(home, ".cursor", "mcp.json"), JSON.stringify(servers));
    write(path.join(home, ".workbuddy", "mcp.json"), JSON.stringify(servers));

    const out = await captureOutput(() => mcpSync({ yes: true }));
    assert.match(out, /in sync/);
  });
});

test("mcp sync --dry-run writes nothing", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { alpha: { command: "a" } } })
    );
    write(path.join(home, ".workbuddy", "mcp.json"), JSON.stringify({ mcpServers: {} }));

    const before = fs.readFileSync(path.join(home, ".workbuddy", "mcp.json"), "utf8");
    const out = await captureOutput(() => mcpSync({ dryRun: true }));
    assert.match(out, /Dry-run/);

    const after = fs.readFileSync(path.join(home, ".workbuddy", "mcp.json"), "utf8");
    assert.equal(after, before, "dry-run must not touch the file");
  });
});

test("mcp sync needs two clients to have anything to reconcile", async () => {
  await withFakeHome(async (home) => {
    write(
      path.join(home, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { alpha: { command: "a" } } })
    );

    const exitCode = await withExitCode(async () => {
      const out = await captureOutput(() => mcpSync({ yes: true }));
      assert.match(out, /at least 2/);
    });
    assert.equal(exitCode, undefined);
  });
});
