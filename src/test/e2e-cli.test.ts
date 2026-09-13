/**
 * End-to-end: drive the *built* CLI in a child process against a throwaway
 * `$HOME`.
 *
 * Why this exists next to ~170 unit tests. Every other test calls a function
 * in-process, so nothing covers the parts that only exist after bundling: the
 * tsup output resolving its dependencies, the `ACM_VERSION` define actually
 * landing, commander handing `argv` to the hand-rolled `parseAddArgs`, and the
 * exit code a CI job (or a user's shell script) reads. acm's entire job is
 * rewriting other applications' config files, and the failure modes that hurt
 * most — writing `undefined` into a config, replacing a file wholesale — are
 * invisible to a unit test but obvious in a real file diff.
 *
 * The six steps below are the main path: add, re-add, read back, survive a
 * broken config, remove, and — the one that matters most — prove that nothing
 * *else* on disk moved.
 *
 * Requires `dist/index.js`. Run with `npm run test:e2e`; `npm test` (which must
 * not depend on a build) deliberately excludes this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CLI = path.resolve(__dirname, "..", "..", "dist", "index.js");
const BUILDER = path.resolve(__dirname, "..", "..", "scripts", "make-sandbox.js");

/** Clients the fixture is seeded for; Cursor is added later for the broken case. */
const HEALTHY = ["claude-code", "codex", "hermes", "opencode"];

interface RunResult {
  code: number;
  out: string;
}

/**
 * Build the fixture and return its fake home plus the initial content hash of
 * every file, keyed by home-relative POSIX path.
 *
 * The snapshot is the fixture's own output rather than a re-walk here, so the
 * "nothing else changed" assertion measures against the tree as it was handed
 * over — including files the walk in this file would have to agree with.
 */
function makeSandbox(): { home: string; snapshot: Record<string, string> } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acm-e2e-"));
  const out = execFileSync(process.execPath, [BUILDER, "--out", root, "--mcp"], {
    encoding: "utf8",
  });
  const [, json = "{}"] = out.split("---SNAPSHOT---");
  return { home: path.join(root, "home"), snapshot: JSON.parse(json.trim()) };
}

/**
 * Environment that makes a child process believe its home is `home`.
 *
 * HOME/USERPROFILE drive `os.homedir()`, and LOCALAPPDATA/APPDATA drive the
 * two app-data lookups (Hermes' config lives under the *local* one). Overriding
 * all four is what keeps the run off the developer's real client configs.
 */
function fakeEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    APPDATA: path.join(home, "AppData", "Roaming"),
    // Keep the output free of ANSI so assertions can match plain text.
    FORCE_COLOR: "0",
  };
}

/** Run the built CLI and capture its exit code instead of throwing on failure. */
function run(home: string, argv: string[]): RunResult {
  try {
    const out = execFileSync(process.execPath, [CLI, ...argv], {
      encoding: "utf8",
      env: fakeEnv(home),
    });
    return { code: 0, out };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Point `~/.acm/config.json` at a client selection, as `acm init` would. */
function selectClients(home: string, ids: string[]): void {
  const dir = path.join(home, ".acm");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ clients: ids }, null, 2));
}

/** The server names a client's config holds, keyed by home-relative path. */
function serversAt(home: string, rel: string): Record<string, Record<string, unknown>> {
  const raw = fs.readFileSync(path.join(home, ...rel.split("/")), "utf8");
  return (JSON.parse(raw).mcpServers ?? {}) as Record<string, Record<string, unknown>>;
}

/** sha256 of every file under `home`, keyed by home-relative POSIX path. */
function snapshot(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (abs: string) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else {
        const rel = path.relative(home, full).split(path.sep).join("/");
        out[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      }
    }
  };
  walk(home);
  return out;
}

/* ------------------------------------------------------------------ */
/*  The bundled artifact                                               */
/* ------------------------------------------------------------------ */

test("e2e: the built CLI reports the version baked in at build time", () => {
  const { home } = makeSandbox();
  const res = run(home, ["--version"]);
  assert.equal(res.code, 0);
  // The tsup `define` replaces process.env.ACM_VERSION; the "0.0.0" fallback
  // means the define did not land, which is worth failing over.
  assert.match(res.out.trim(), /^\d+\.\d+\.\d+$/);
  assert.notEqual(res.out.trim(), "0.0.0");
});

test("e2e: --help documents the three command families", () => {
  const { home } = makeSandbox();
  const res = run(home, ["--help"]);
  assert.equal(res.code, 0);
  for (const cmd of ["init", "mcp", "key", "skill"]) {
    assert.match(res.out, new RegExp(`\\b${cmd}\\b`), `help must list ${cmd}`);
  }
});

/* ------------------------------------------------------------------ */
/*  Main path: add → re-add → list → remove                            */
/* ------------------------------------------------------------------ */

test("e2e: add writes the server to every selected client and reports success", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "add", "e2e-new", "npx", "-y", "e2e-pkg"]);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /Added "e2e-new" to 4 client\(s\)/);

  // Each client stores it in its own shape; the common shape must survive all
  // four encodings (JSON, TOML table, YAML mapping, nested OpenCode entry).
  for (const rel of [".claude.json", ".codex/config.toml", ".config/opencode/opencode.json"]) {
    const text = fs.readFileSync(path.join(home, ...rel.split("/")), "utf8");
    assert.match(text, /e2e-new/, `${rel} must mention the new server`);
    assert.match(text, /e2e-pkg/, `${rel} must carry the package argument`);
  }
  const hermes = fs.readFileSync(
    path.join(home, "AppData", "Local", "hermes", "config.yaml"),
    "utf8"
  );
  assert.match(hermes, /e2e-new/);
  // Hermes spells the switch `enabled` (inverted from the common `disabled`).
  // An entry that never carried the key is written without it — Hermes' default
  // is enabled, and stamping `enabled: true` onto every entry would reformat a
  // file full of servers that were already fine. What must never appear is a
  // *disabled* server the user never asked to disable.
  assert.doesNotMatch(hermes, /enabled: false/);
});

test("e2e: a server flag such as -y survives commander and reaches the config", () => {
  const { home } = makeSandbox();
  selectClients(home, ["claude-code"]);

  // `-y` is unknown to commander; without the hand-rolled parser in add-args.ts
  // it would be swallowed as an option and the server would launch without it.
  const res = run(home, ["mcp", "add", "e2e-flags", "npx", "-y", "--foo", "bar"]);
  assert.equal(res.code, 0, res.out);
  assert.deepEqual(serversAt(home, ".claude.json")["e2e-flags"], {
    command: "npx",
    args: ["-y", "--foo", "bar"],
  });
});

test("e2e: re-adding an identical server is a no-op, not a rewrite", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);
  assert.equal(run(home, ["mcp", "add", "e2e-idem", "npx", "-y", "p"]).code, 0);

  const before = fs.readFileSync(path.join(home, ".claude.json"), "utf8");
  const res = run(home, ["mcp", "add", "e2e-idem", "npx", "-y", "p"]);

  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /already configured as requested/);
  assert.equal(
    fs.readFileSync(path.join(home, ".claude.json"), "utf8"),
    before,
    "an unchanged server must not be rewritten"
  );
});

test("e2e: a differing server is a conflict unless --force is passed", () => {
  const { home } = makeSandbox();
  selectClients(home, ["claude-code"]);

  // `acm-e2e-conflict` is seeded in Claude Code only, with a different command.
  const conflict = run(home, ["mcp", "add", "acm-e2e-conflict", "changed-cmd"]);
  assert.equal(conflict.code, 1, "a conflict must be a non-zero exit");
  assert.match(conflict.out, /different settings/);
  // The pre-existing entry must be untouched.
  assert.deepEqual(serversAt(home, ".claude.json")["acm-e2e-conflict"], {
    command: "legacy-cmd",
    args: ["--old"],
  });

  const forced = run(home, ["mcp", "add", "acm-e2e-conflict", "changed-cmd", "--force"]);
  assert.equal(forced.code, 0, forced.out);
  assert.deepEqual(serversAt(home, ".claude.json")["acm-e2e-conflict"], {
    command: "changed-cmd",
    args: [],
  });
});

test("e2e: a field a client cannot store is warned about, not dropped in silence", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "add", "e2e-cwd", "npx", "-y", "c", "--cwd", "/work"]);

  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /do not store every field/);
  // Claude Code and OpenCode have no `cwd` key; Codex and Hermes do.
  assert.match(res.out, /Claude Code \(cwd\)/);
  assert.match(res.out, /OpenCode \(cwd\)/);
  assert.match(
    fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8"),
    /cwd = "\/work"/,
    "Codex can store cwd, so it must actually be written"
  );
});

test("e2e: --dry-run reports the plan and writes nothing", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);
  const before = snapshot(home);

  const res = run(home, ["mcp", "add", "e2e-dry", "npx", "-y", "p", "--dry-run"]);

  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /Dry-run/);
  assert.deepEqual(snapshot(home), before, "dry-run must leave the tree untouched");
});

test("e2e: list reads the servers back from every client", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "list"]);

  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /MCP Servers across 4 client\(s\)/);
  // Seeded in all four, so every client must be joined to it.
  assert.match(res.out, /acm-e2e-alpha/);
  assert.match(res.out, /npx -y alpha-pkg/);
  // Seeded in one only — the other three must be shown as absent, not omitted.
  assert.match(res.out, /acm-e2e-conflict/);
  assert.match(res.out, /not configured/);
});

test("e2e: remove deletes the server and keeps every other one", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);
  assert.equal(run(home, ["mcp", "add", "e2e-rm", "npx", "-y", "p"]).code, 0);

  const res = run(home, ["mcp", "remove", "e2e-rm"]);

  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /Removed "e2e-rm" from 4 client\(s\)/);
  for (const rel of [".claude.json", ".codex/config.toml", ".config/opencode/opencode.json"]) {
    const text = fs.readFileSync(path.join(home, ...rel.split("/")), "utf8");
    assert.doesNotMatch(text, /e2e-rm/, `${rel} must no longer hold the server`);
    // ...while the neighbours stay exactly where they were.
    assert.match(text, /acm-e2e-alpha/);
  }
});

test("e2e: removing an unknown server fails loudly instead of reporting success", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "remove", "never-existed"]);

  assert.equal(res.code, 1);
  assert.match(res.out, /not found/);
});

/* ------------------------------------------------------------------ */
/*  A client whose config cannot be parsed                             */
/* ------------------------------------------------------------------ */

test("e2e: list reports an unreadable config but still shows the readable ones", () => {
  const { home } = makeSandbox();
  selectClients(home, [...HEALTHY, "cursor"]); // .cursor/mcp.json is truncated

  const res = run(home, ["mcp", "list"]);

  assert.equal(res.code, 1, "an unreadable config must fail the run");
  assert.match(res.out, /config unreadable/);
  // Unknown is not the same as absent — but the healthy clients still list.
  assert.match(res.out, /acm-e2e-alpha/);
  assert.match(res.out, /Cannot parse/);
});

test("e2e: an unreadable config is never rewritten", () => {
  const { home } = makeSandbox();
  selectClients(home, ["cursor"]);
  const broken = path.join(home, ".cursor", "mcp.json");
  const before = fs.readFileSync(broken, "utf8");

  const res = run(home, ["mcp", "add", "e2e-bad", "npx"]);

  assert.equal(res.code, 1);
  assert.equal(
    fs.readFileSync(broken, "utf8"),
    before,
    "a file that will not parse must be left alone, not rebuilt from empty"
  );
  assert.equal(
    fs.existsSync(`${broken}.bak`),
    false,
    "nothing was written, so there is nothing to back up"
  );
});

test("e2e: sync refuses to run rather than reconcile against a partial view", () => {
  const { home } = makeSandbox();
  selectClients(home, [...HEALTHY, "cursor"]);
  // Give the healthy clients something to reconcile, so a buggy sync that
  // ignored the broken client would visibly write.
  const before = snapshot(home);

  const res = run(home, ["mcp", "sync", "--yes"]);

  assert.equal(res.code, 1);
  assert.match(res.out, /Could not read/);
  assert.deepEqual(snapshot(home), before, "an aborted sync must write nothing");
});

/* ------------------------------------------------------------------ */
/*  Argument validation reaches the real binary                        */
/* ------------------------------------------------------------------ */

test("e2e: a mistyped --client id is reported, not silently widened to all", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "add", "e2e-typo", "npx", "--client", "cursro"]);

  assert.equal(res.code, 1);
  assert.match(res.out, /Unknown or unavailable client id/);
  // The typo must not have been treated as "every client".
  assert.equal(fs.existsSync(path.join(home, ".claude.json.bak")), false);
});

test("e2e: --client with no ids at all is an error, not 'all clients'", () => {
  const { home } = makeSandbox();
  selectClients(home, HEALTHY);

  const res = run(home, ["mcp", "add", "e2e-empty", "npx", "--client", ",,,"]);

  assert.equal(res.code, 1);
  assert.match(res.out, /without any client id/);
});

/* ------------------------------------------------------------------ */
/*  The assertion that matters most: blast radius                      */
/* ------------------------------------------------------------------ */

test("e2e: a full add/remove cycle changes only the files it owns", () => {
  const { home, snapshot: before } = makeSandbox();
  selectClients(home, HEALTHY);

  assert.equal(run(home, ["mcp", "add", "e2e-cycle", "npx", "-y", "p"]).code, 0);
  assert.equal(run(home, ["mcp", "remove", "e2e-cycle"]).code, 0);

  const after = snapshot(home);
  const { mcpServers: _a, ...claudeBefore } = JSON.parse(
    fs.readFileSync(path.join(home, ".claude.json"), "utf8")
  );

  // Every file whose bytes moved must be a config acm legitimately touched, and
  // every skill fixture must be byte-identical — this is where a stray write,
  // a wrong path or a `writeConfig` that rebuilt a file from scratch shows up.
  //
  // `.acm/config.json` is excluded because the *test* creates it (via
  // selectClients) after the snapshot was taken; it is not in the fixture.
  const changed = Object.keys({ ...before, ...after }).filter(
    (rel) => before[rel] !== after[rel] && rel !== ".acm/config.json"
  );
  const allowed = new Set([
    ".claude.json",
    ".codex/config.toml",
    ".config/opencode/opencode.json",
    "AppData/Local/hermes/config.yaml",
  ]);
  for (const rel of changed) {
    assert.ok(allowed.has(rel) || rel.endsWith(".bak"), `unexpected file changed: ${rel}`);
  }

  // The neighbours in each touched file must be exactly as they were.
  assert.equal(claudeBefore.numStartups, 42, "unrelated keys must survive");
  assert.equal(claudeBefore.theme, "dark");
  assert.match(
    fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8"),
    /model = "gpt-5-codex"/,
    "the unrelated TOML table must survive"
  );
  assert.match(
    fs.readFileSync(path.join(home, "AppData", "Local", "hermes", "config.yaml"), "utf8"),
    /model: claude-sonnet-4/,
    "Hermes' whole settings tree must survive"
  );
  assert.match(
    fs.readFileSync(path.join(home, ".config", "opencode", "opencode.json"), "utf8"),
    /opencode\.ai\/config\.json/,
    "OpenCode's $schema must survive"
  );
});

test("e2e: a rewritten config is backed up before it is replaced", () => {
  const { home } = makeSandbox();
  selectClients(home, ["claude-code"]);
  const original = fs.readFileSync(path.join(home, ".claude.json"), "utf8");

  assert.equal(run(home, ["mcp", "add", "e2e-bak", "npx"]).code, 0);

  const bak = `${path.join(home, ".claude.json")}.bak`;
  assert.ok(fs.existsSync(bak), "the previous contents must be recoverable");
  assert.equal(fs.readFileSync(bak, "utf8"), original);
});
