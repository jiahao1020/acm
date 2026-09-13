import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { canonical } from "../commands/mcp";

/**
 * `canonical()` is what `sameServer()` compares, so it decides whether a
 * re-add of an identical server is silently "up to date" or a conflict that
 * demands `--force`. These cases pin the equivalence rules.
 */

function tmpFile(name: string, data: unknown): string {
  const dir = fs.mkdtempSync(path.join(process.env.TEMP ?? "/tmp", "acm-canon-"));
  const file = path.join(dir, name);
  writeJsonFile(file, data);
  return file;
}

test("an undefined property is equivalent to an absent one", () => {
  // JSON.stringify(undefined) is not a string, so without filtering this
  // compared unequal and a re-add of the same server reported a conflict.
  assert.equal(canonical({ a: undefined }), canonical({}));
  assert.equal(canonical({ command: "npx", env: undefined }), canonical({ command: "npx" }));
});

test("key order does not matter", () => {
  assert.equal(
    canonical({ command: "npx", args: ["-y", "pkg"] }),
    canonical({ args: ["-y", "pkg"], command: "npx" })
  );
});

test("nested objects and arrays are compared structurally", () => {
  assert.equal(
    canonical({ env: { B: "2", A: "1" } }),
    canonical({ env: { A: "1", B: "2" } })
  );
  assert.notEqual(canonical({ args: ["a", "b"] }), canonical({ args: ["b", "a"] }));
});

test("genuinely different values stay different", () => {
  assert.notEqual(canonical({ command: "npx" }), canonical({ command: "uvx" }));
  assert.notEqual(canonical({ disabled: false }), canonical({ disabled: true }));
  assert.notEqual(canonical({ disabled: false }), canonical({}));
});

test("an undefined inside an array is not silently dropped", () => {
  // Arrays keep positional meaning: [1, undefined] must not equal [1].
  assert.notEqual(canonical([1, undefined]), canonical([1]));
});
