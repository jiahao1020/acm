/**
 * The Hermes adapter writes into `config.yaml`, which is not an MCP file — it is
 * Hermes' entire settings tree. These tests pin the two things that can go
 * catastrophically wrong: losing the rest of that tree, and getting the
 * `enabled` / `disabled` polarity wrong so a "disabled" server stays live.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { HermesAdapter } from "../clients/hermes";
import { withFakeHome } from "./helpers";

/** A config.yaml with the shape the real Hermes install uses. */
const REAL_CONFIG = `model:
  provider: nous
  name: anthropic/claude-sonnet-4.6

toolsets:
  - terminal
  - file

mcp_servers:
  sql-ops:
    enabled: true
    timeout: 180
    connect_timeout: 30
    command: D:\\study\\sql-ops\\python.exe
    args:
      - -m
      - sql_ops_mcp
  ima-mcp:
    enabled: false
    url: https://ima.qq.com/mcp

dashboard:
  port: 9119
`;

function hermesConfigPath(home: string): string {
  return path.join(home, "AppData", "Local", "hermes", "config.yaml");
}

function writeRealConfig(home: string): string {
  const p = hermesConfigPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, REAL_CONFIG, "utf8");
  return p;
}

function readConfig(p: string): Record<string, any> {
  return parseYaml(fs.readFileSync(p, "utf8")) as Record<string, any>;
}

test("hermes reads the mcp_servers mapping", async () => {
  await withFakeHome(async (home) => {
    writeRealConfig(home);
    const cfg = new HermesAdapter().readConfig();
    assert.deepEqual(Object.keys(cfg.mcpServers).sort(), ["ima-mcp", "sql-ops"]);
    assert.equal(cfg.mcpServers["sql-ops"].command, "D:\\study\\sql-ops\\python.exe");
    assert.deepEqual(cfg.mcpServers["sql-ops"].args, ["-m", "sql_ops_mcp"]);
  });
});

test("hermes translates enabled:false into disabled:true", async () => {
  await withFakeHome(async (home) => {
    writeRealConfig(home);
    const cfg = new HermesAdapter().readConfig();
    assert.equal(cfg.mcpServers["ima-mcp"].disabled, true);
    assert.equal(cfg.mcpServers["sql-ops"].disabled, undefined);
  });
});

test("hermes keeps every unrelated branch when writing", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    const adapter = new HermesAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers.demo = { command: "npx", args: ["-y", "demo"] };
    adapter.writeConfig(cfg);

    const doc = readConfig(p);
    assert.equal(doc.model.name, "anthropic/claude-sonnet-4.6");
    assert.equal(doc.dashboard.port, 9119);
    assert.deepEqual(doc.toolsets, ["terminal", "file"]);
    assert.ok(doc.mcp_servers.demo, "the new server should be present");
  });
});

test("hermes keeps servers the caller did not drop, with their extra keys", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    // A realistic caller writes the map it read back, plus a new entry — that
    // is what mcp add and mcp sync do.
    const adapter = new HermesAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers.demo = { command: "npx", args: ["-y", "demo"] };
    adapter.writeConfig(cfg);

    const doc = readConfig(p);
    assert.deepEqual(Object.keys(doc.mcp_servers).sort(), ["demo", "ima-mcp", "sql-ops"]);
    assert.equal(doc.mcp_servers["sql-ops"].timeout, 180, "Hermes-only keys survive");
    assert.equal(doc.mcp_servers["ima-mcp"].enabled, false, "disabled state survives");
  });
});

test("hermes drops a server the caller left out, so remove works", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    const adapter = new HermesAdapter();
    const cfg = adapter.readConfig();
    // This is exactly how `acm mcp remove` expresses a deletion.
    delete cfg.mcpServers["sql-ops"];
    adapter.writeConfig(cfg);

    const doc = readConfig(p);
    assert.deepEqual(Object.keys(doc.mcp_servers), ["ima-mcp"]);
    assert.equal(doc.model.name, "anthropic/claude-sonnet-4.6", "rest of the file is intact");
  });
});

test("hermes writing disabled:true produces enabled:false", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    new HermesAdapter().writeConfig({
      mcpServers: { "sql-ops": { command: "python", disabled: true } },
    });

    const doc = readConfig(p);
    assert.equal(doc.mcp_servers["sql-ops"].enabled, false);
    assert.equal(doc.mcp_servers["sql-ops"].disabled, undefined, "no acm vocabulary on disk");
  });
});

test("hermes re-enabling an entry writes enabled:true", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    new HermesAdapter().writeConfig({
      mcpServers: { "ima-mcp": { url: "https://ima.qq.com/mcp", disabled: false } },
    });

    const doc = readConfig(p);
    assert.equal(doc.mcp_servers["ima-mcp"].enabled, true);
  });
});

test("hermes does not add an enabled key to a server that never had one", async () => {
  await withFakeHome(async (home) => {
    const p = hermesConfigPath(home);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // `obsidian` carries no `enabled` key at all — the real Hermes config has
    // entries like this, and adding one would reformat a file that was fine.
    fs.writeFileSync(
      p,
      "mcp_servers:\n  obsidian:\n    command: python\n    args:\n      - server.py\n",
      "utf8"
    );

    new HermesAdapter().writeConfig({
      mcpServers: { obsidian: { command: "python", args: ["server.py"] } },
    });

    const doc = readConfig(p);
    assert.equal(
      "enabled" in doc.mcp_servers.obsidian,
      false,
      "an entry with no enabled key must not gain one"
    );
  });
});

test("hermes leaves an existing enabled:true exactly where it was", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    new HermesAdapter().writeConfig({
      mcpServers: { "sql-ops": { command: "python", args: ["-m", "m"] } },
    });

    const doc = readConfig(p);
    assert.equal(doc.mcp_servers["sql-ops"].enabled, true);
  });
});

test("hermes merges a remote url into an existing stdio entry", async () => {
  await withFakeHome(async (home) => {
    const p = writeRealConfig(home);
    const adapter = new HermesAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["sql-ops"] = { url: "https://example.com/mcp" };
    adapter.writeConfig(cfg);

    const doc = readConfig(p);
    assert.equal(doc.mcp_servers["sql-ops"].url, "https://example.com/mcp");
    assert.equal(doc.mcp_servers["sql-ops"].timeout, 180);
  });
});

test("hermes leaves an unparseable config untouched", async () => {
  await withFakeHome(async (home) => {
    const p = hermesConfigPath(home);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const broken = "model: [unclosed\n  bad: : :\n";
    fs.writeFileSync(p, broken, "utf8");

    // The adapter must refuse rather than write a rebuilt file over the top.
    assert.throws(
      () => new HermesAdapter().readConfig(),
      /Cannot parse/
    );
    assert.throws(
      () => new HermesAdapter().writeConfig({ mcpServers: { x: { command: "y" } } }),
      /Cannot parse/
    );
    assert.equal(fs.readFileSync(p, "utf8"), broken, "file is byte-identical");
  });
});

test("hermes reports a config path only when the file exists", async () => {
  await withFakeHome(async (home) => {
    const adapter = new HermesAdapter();
    assert.equal(adapter.getConfigPath(), null);
    assert.equal(adapter.detect(), false);

    writeRealConfig(home);
    assert.equal(adapter.getConfigPath(), hermesConfigPath(home));
    assert.equal(adapter.detect(), true);
  });
});

test("hermes round-trips its own read output", async () => {
  await withFakeHome(async (home) => {
    writeRealConfig(home);
    const adapter = new HermesAdapter();
    const first = adapter.readConfig();
    adapter.writeConfig(first);
    const second = adapter.readConfig();
    assert.deepEqual(second.mcpServers, first.mcpServers);
  });
});
