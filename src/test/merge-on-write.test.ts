import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { CursorAdapter } from "../clients/cursor";
import { ClaudeDesktopAdapter } from "../clients/claude-desktop";
import { OpenCodeAdapter } from "../clients/open-code";
import { ZCodeAdapter } from "../clients/zcode";
import { CodexAdapter } from "../clients/codex";
import { withFakeHome } from "./helpers";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Writing replaces the whole `mcpServers` object, so anything the common model
 * does not know about used to be destroyed. These cases pin the merge.
 */

test("Cursor keeps a client-specific key on an entry acm rewrites", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".cursor", "mcp.json");
    write(
      file,
      JSON.stringify({
        mcpServers: {
          demo: { command: "npx", args: ["-y", "pkg"], env: { KEEP_ME: "1" } },
        },
      })
    );

    const adapter = new CursorAdapter();
    const cfg = adapter.readConfig();
    // Re-add the same server with an extra env var, as `mcp add` would.
    cfg.mcpServers["demo"] = { command: "npx", args: ["-y", "pkg"], env: { NEW: "2" } };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.deepEqual(after.mcpServers.demo.env, { KEEP_ME: "1", NEW: "2" });
  });
});

test("Cursor preserves a top-level key on the server entry it does not model", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".cursor", "mcp.json");
    write(
      file,
      JSON.stringify({
        mcpServers: {
          demo: { command: "npx", args: ["-y", "pkg"], startup_timeout_ms: 30000 },
        },
      })
    );

    const adapter = new CursorAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["other"] = { command: "uvx", args: ["srv"] };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.equal(
      after.mcpServers.demo.startup_timeout_ms,
      30000,
      "an unmodelled key must survive a rewrite of the file"
    );
    assert.equal(after.mcpServers.other.command, "uvx");
  });
});

test("Claude Desktop keeps unrelated top-level and per-entry keys", () => {
  withFakeHome((home) => {
    const file = path.join(home, "Claude", "claude_desktop_config.json");
    write(
      file,
      JSON.stringify({
        globalShortcut: "Cmd+Space",
        mcpServers: { demo: { command: "npx", custom: "keep" } },
      })
    );

    // appDataDir() on Windows is APPDATA; point it at the fake home.
    process.env.APPDATA = home;
    const adapter = new ClaudeDesktopAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["demo"] = { command: "uvx", args: ["srv"] };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.equal(after.globalShortcut, "Cmd+Space");
    assert.equal(after.mcpServers.demo.custom, "keep");
    assert.equal(after.mcpServers.demo.command, "uvx");
  });
});

test("OpenCode keeps unmodelled keys on an entry and does not fuse stale shapes", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".config", "opencode", "opencode.json");
    write(
      file,
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          remoteish: { type: "remote", url: "https://old", enabled: true, extraKey: "keep" },
        },
      })
    );

    const adapter = new OpenCodeAdapter();
    const cfg = adapter.readConfig();
    // Turn it into a local server: the stale url must not linger.
    cfg.mcpServers["remoteish"] = { command: "npx", args: ["-y", "pkg"] };
    adapter.writeConfig(cfg);

    const entry = readJson(file).mcp.remoteish;
    assert.deepEqual(entry.command, ["npx", "-y", "pkg"]);
    assert.equal(entry.url, undefined, "a stale url must not survive the type change");
    assert.equal(entry.type, "local");
    assert.equal(entry.extraKey, "keep", "an unmodelled key must survive");
  });
});

test("ZCode keeps an unmodelled key on a server entry", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".zcode", "cli", "config.json");
    write(
      file,
      JSON.stringify({
        storage: { token: "KEEP" },
        mcp: { servers: { demo: { command: "npx", custom: "keep" } } },
      })
    );

    const adapter = new ZCodeAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["demo"] = { command: "uvx", args: ["srv"] };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.equal(after.storage.token, "KEEP");
    assert.equal(after.mcp.servers.demo.custom, "keep");
    assert.equal(after.mcp.servers.demo.command, "uvx");
  });
});

test("Codex keeps an unmodelled key on a TOML server table", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".codex", "config.toml");
    write(
      file,
      `model = "gpt-5"\n\n[mcp_servers.demo]\ncommand = "npx"\nstartup_timeout_ms = 20000\n`
    );

    const adapter = new CodexAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["demo"] = { command: "uvx", args: ["srv"] };
    adapter.writeConfig(cfg);

    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /model = "gpt-5"/);
    assert.match(text, /startup_timeout_ms = 20000/, "a Codex-only key must survive");
  });
});
