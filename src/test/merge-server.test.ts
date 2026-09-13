import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeServerEntry,
  mergeServersMap,
  unsupportedFields,
} from "../utils/merge-server";

/* ------------------------------------------------------------------ */
/*  mergeServersMap: the whole-map form used on every write             */
/* ------------------------------------------------------------------ */

test("mergeServersMap keeps disk-only entries and merges shared ones", () => {
  const merged = mergeServersMap(
    {
      kept: { command: "old", custom: "keep" },
      shared: { command: "old", env: { A: "1" } },
    },
    {
      shared: { command: "new", env: { B: "2" } },
      added: { command: "added" },
    }
  );

  assert.deepEqual(Object.keys(merged).sort(), ["added", "shared"]);
  assert.deepEqual(merged.shared, { command: "new", env: { A: "1", B: "2" } });
  assert.equal(merged.added.command, "added");
});

test("mergeServersMap treats a missing on-disk map as empty", () => {
  const merged = mergeServersMap(undefined, { a: { command: "c" } });
  assert.deepEqual(merged, { a: { command: "c" } });
});

test("mergeServersMap returns a fresh object rather than mutating its inputs", () => {
  const onDisk = { a: { command: "old" } };
  const incoming = { a: { command: "new" } };
  const merged = mergeServersMap(onDisk, incoming);

  assert.equal(onDisk.a.command, "old", "the on-disk map must not be touched");
  assert.equal(incoming.a.command, "new");
  assert.notEqual(merged.a, onDisk.a, "entries must be copies");
});

/* ------------------------------------------------------------------ */
/*  mergeServerEntry: never lose keys we do not model                   */
/* ------------------------------------------------------------------ */

test("keys the incoming entry does not define are kept from disk", () => {
  const merged = mergeServerEntry(
    { command: "npx", startup_timeout_ms: 20000, custom: "keep" },
    { command: "npx", args: ["-y", "pkg"] }
  );

  assert.equal(merged.command, "npx");
  assert.deepEqual(merged.args, ["-y", "pkg"]);
  assert.equal(merged.startup_timeout_ms, 20000, "a client-only key must survive");
  assert.equal(merged.custom, "keep");
});

test("the incoming entry wins on conflict", () => {
  const merged = mergeServerEntry(
    { command: "uvx", args: ["old"] },
    { command: "npx", args: ["-y", "pkg"] }
  );
  assert.equal(merged.command, "npx");
  assert.deepEqual(merged.args, ["-y", "pkg"], "args is replaced wholesale, not unioned");
});

test("env and headers merge key by key", () => {
  const merged = mergeServerEntry(
    { command: "npx", env: { KEEP: "1", OVERRIDE: "old" } },
    { command: "npx", env: { OVERRIDE: "new", ADDED: "2" } }
  );

  assert.deepEqual(merged.env, { KEEP: "1", OVERRIDE: "new", ADDED: "2" });
});

test("headers merge the same way, independently of env", () => {
  const merged = mergeServerEntry(
    { url: "https://a", headers: { Authorization: "old", Keep: "1" } },
    { url: "https://a", headers: { Authorization: "new" } }
  );
  assert.deepEqual(merged.headers, { Authorization: "new", Keep: "1" });
});

test("an undefined value never erases what is on disk", () => {
  const merged = mergeServerEntry(
    { command: "npx", cwd: "/work" },
    { command: "npx", cwd: undefined }
  );
  assert.equal(merged.cwd, "/work");
});

test("merging into a missing entry returns the incoming entry as-is", () => {
  const server = { command: "npx", args: ["-y", "pkg"] };
  assert.deepEqual(mergeServerEntry(undefined, server), server);
});

test("merging does not mutate either argument", () => {
  const onDisk = { command: "uvx", env: { A: "1" } };
  const incoming = { command: "npx", env: { B: "2" } };
  mergeServerEntry(onDisk, incoming);

  assert.deepEqual(onDisk, { command: "uvx", env: { A: "1" } });
  assert.deepEqual(incoming, { command: "npx", env: { B: "2" } });
});

/* ------------------------------------------------------------------ */
/*  unsupportedFields: make a silent drop visible                       */
/* ------------------------------------------------------------------ */

test("fields outside the declared set are reported", () => {
  const problems = unsupportedFields(
    { command: "npx", cwd: "/work", env: { A: "1" } },
    ["env"]
  );
  assert.deepEqual(problems, ["cwd"]);
});

test("an adapter that declares nothing accepts nothing", () => {
  // The safe reading: a wrong warning is recoverable, a silent drop is not.
  const problems = unsupportedFields({ command: "npx", cwd: "/w", env: { A: "1" } }, undefined);
  assert.deepEqual(problems, ["cwd", "env"]);
});

test("all supported fields report nothing", () => {
  const problems = unsupportedFields(
    { command: "npx", cwd: "/w", env: { A: "1" }, headers: { H: "1" }, disabled: true },
    ["cwd", "env", "headers", "disabled"]
  );
  assert.deepEqual(problems, []);
});

test("absent fields are never reported", () => {
  assert.deepEqual(unsupportedFields({ command: "npx" }, []), []);
});

test("only an explicit disabled:true is reported", () => {
  // `disabled: false` is the implicit default everywhere, so it is not a loss.
  assert.deepEqual(unsupportedFields({ command: "npx", disabled: false }, []), []);
  assert.deepEqual(unsupportedFields({ command: "npx", disabled: true }, []), ["disabled"]);
});
