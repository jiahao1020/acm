import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { parse as parseToml } from "smol-toml";
import { ZCodeAdapter } from "../clients/zcode";
import { OpenCodeAdapter } from "../clients/open-code";
import { CodexAdapter } from "../clients/codex";
import { SpecJsonAdapter, SIMPLE_JSON_CLIENTS } from "../clients/simple-json-clients";
import { ConfigParseError } from "../utils/config-error";
import { withFakeHome } from "./helpers";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* ------------------------------------------------------------------ */
/*  ZCode: nested mcp.servers inside a file full of other settings     */
/* ------------------------------------------------------------------ */

test("ZCode keeps unrelated settings and tolerates trailing commas", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".zcode", "cli", "config.json");
    write(
      file,
      `{ "storage": { "token": "KEEP" }, "telemetry": true, "mcp": { "servers": {} }, }`
    );

    const adapter = new ZCodeAdapter();
    const cfg = adapter.readConfig();
    cfg.mcpServers["demo"] = { command: "npx", args: ["-y", "pkg"] };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.equal(after.storage.token, "KEEP", "unrelated settings must survive");
    assert.equal(after.telemetry, true);
    assert.deepEqual(after.mcp.servers.demo, { command: "npx", args: ["-y", "pkg"] });
  });
});

test("ZCode leaves an unparseable config untouched", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".zcode", "cli", "config.json");
    const broken = `{ "storage": { "token": "KEEP" }`;
    write(file, broken);

    const adapter = new ZCodeAdapter();
    assert.throws(() => adapter.readConfig(), ConfigParseError);
    assert.throws(
      () => adapter.writeConfig({ mcpServers: { demo: { command: "npx" } } }),
      ConfigParseError
    );
    assert.equal(fs.readFileSync(file, "utf8"), broken, "file must not be rewritten");
  });
});

/* ------------------------------------------------------------------ */
/*  OpenCode: different schema, same obligation to preserve the file    */
/* ------------------------------------------------------------------ */

test("OpenCode preserves unrelated keys and round-trips its own schema", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".config", "opencode", "opencode.json");
    write(
      file,
      `{
  "$schema": "https://opencode.ai/config.json",
  "theme": "dark", // keep me
  "mcp": {
    "existing": {
      "type": "local",
      "command": ["uvx", "srv"],
      "environment": { "A": "1" },
      "enabled": false
    }
  }
}`
    );

    const adapter = new OpenCodeAdapter();
    const cfg = adapter.readConfig();
    assert.deepEqual(cfg.mcpServers["existing"], {
      command: "uvx",
      args: ["srv"],
      env: { A: "1" },
      disabled: true,
    });

    cfg.mcpServers["demo"] = { command: "npx", args: ["-y", "pkg"], env: { B: "2" } };
    adapter.writeConfig(cfg);

    const after = readJson(file);
    assert.equal(after.theme, "dark", "unrelated key must survive");
    assert.equal(after.$schema, "https://opencode.ai/config.json");
    assert.deepEqual(after.mcp.demo, {
      type: "local",
      command: ["npx", "-y", "pkg"],
      environment: { B: "2" },
      enabled: true,
    });
    assert.equal(after.mcp.existing.enabled, false, "disabled round-trips as enabled:false");
  });
});

test("OpenCode leaves an unparseable config untouched", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".config", "opencode", "opencode.json");
    const broken = `{ "$schema": "x", "theme": "dark" `;
    write(file, broken);

    const adapter = new OpenCodeAdapter();
    assert.throws(
      () => adapter.writeConfig({ mcpServers: { demo: { command: "npx" } } }),
      ConfigParseError
    );
    assert.equal(fs.readFileSync(file, "utf8"), broken);
  });
});

/* ------------------------------------------------------------------ */
/*  Codex: TOML                                                            */
/* ------------------------------------------------------------------ */

test("Codex preserves unrelated TOML tables", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".codex", "config.toml");
    write(
      file,
      `model = "gpt-5"\n\n[profiles.work]\napproval_policy = "never"\n\n[mcp_servers.alpha]\ncommand = "uvx"\nargs = ["srv"]\n`
    );

    const adapter = new CodexAdapter();
    const cfg = adapter.readConfig();
    assert.deepEqual(cfg.mcpServers["alpha"], { command: "uvx", args: ["srv"] });

    cfg.mcpServers["beta"] = { command: "npx", args: ["-y", "pkg"] };
    adapter.writeConfig(cfg);

    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /model = "gpt-5"/);
    assert.match(text, /\[profiles\.work\]/);

    const parsed = parseToml(text) as Record<string, any>;
    assert.deepEqual(parsed.mcp_servers["alpha"], { command: "uvx", args: ["srv"] });
    assert.deepEqual(parsed.mcp_servers["beta"], { command: "npx", args: ["-y", "pkg"] });
  });
});

test("Codex leaves an unparseable config untouched", () => {
  withFakeHome((home) => {
    const file = path.join(home, ".codex", "config.toml");
    const broken = `model = "gpt-5"\n[unclosed`;
    write(file, broken);

    const adapter = new CodexAdapter();
    assert.throws(
      () => adapter.writeConfig({ mcpServers: { demo: { command: "npx" } } }),
      ConfigParseError
    );
    assert.equal(fs.readFileSync(file, "utf8"), broken);
  });
});

/* ------------------------------------------------------------------ */
/*  Spec-driven clients share StandardJsonAdapter                       */
/* ------------------------------------------------------------------ */

test("spec adapters keep unrelated keys and update every candidate file", () => {
  withFakeHome((home) => {
    const spec = SIMPLE_JSON_CLIENTS.find((s) => s.id === "codebuddy");
    assert.ok(spec, "codebuddy spec must exist");

    const mcpFile = path.join(home, ".codebuddy", "mcp.json");
    const settingsFile = path.join(home, ".codebuddy", "settings.json");
    write(mcpFile, `{ "mcpServers": {} }`);
    write(settingsFile, `{ "enabledPlugins": ["x"] }`);

    const adapter = new SpecJsonAdapter(spec);
    assert.equal(adapter.detect(), true);

    const cfg = adapter.readConfig();
    cfg.mcpServers["demo"] = { command: "npx", args: ["-y", "pkg"] };
    adapter.writeConfig(cfg);

    assert.deepEqual(readJson(settingsFile).enabledPlugins, ["x"], "unrelated key survives");
    assert.deepEqual(readJson(mcpFile).mcpServers.demo, {
      command: "npx",
      args: ["-y", "pkg"],
    });
    assert.deepEqual(readJson(settingsFile).mcpServers.demo, {
      command: "npx",
      args: ["-y", "pkg"],
    });
  });
});
