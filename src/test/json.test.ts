import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readJsonFile, writeJsonFile } from "../utils/json";
import { readTomlFile } from "../utils/toml";
import { ConfigParseError } from "../utils/config-error";

function tmpFile(name: string, text?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acm-json-"));
  const file = path.join(dir, name);
  if (text !== undefined) fs.writeFileSync(file, text, "utf8");
  return file;
}

test("readJsonFile returns null for a missing or empty file", () => {
  assert.equal(readJsonFile(tmpFile("nope.json")), null);
  assert.equal(readJsonFile(tmpFile("empty.json", "   \n")), null);
});

test("readJsonFile tolerates JSON5 comments and trailing commas", () => {
  const file = tmpFile(
    "config.json",
    `{
  // a comment clients actually ship
  "mcpServers": { "a": { "command": "npx" }, },
}`
  );
  assert.deepEqual(readJsonFile(file), { mcpServers: { a: { command: "npx" } } });
});

test("readJsonFile throws ConfigParseError instead of pretending the file is empty", () => {
  const file = tmpFile("broken.json", `{ "storage": { "token": "KEEP" }`);
  assert.throws(() => readJsonFile(file), ConfigParseError);
  try {
    readJsonFile(file);
  } catch (err: unknown) {
    assert.ok(err instanceof ConfigParseError);
    assert.equal(err.filePath, file);
    assert.match(err.message, /Cannot parse/);
  }
});

test("readJsonFile rejects non-object JSON", () => {
  assert.throws(() => readJsonFile(tmpFile("array.json", "[1,2,3]")), ConfigParseError);
});

test("writeJsonFile backs up the previous contents and leaves no temp file", () => {
  const file = tmpFile("config.json", `{"keep":true}`);
  writeJsonFile(file, { keep: true, added: 1 });

  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { keep: true, added: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + ".bak", "utf8")), { keep: true });
  assert.equal(fs.existsSync(file + ".tmp"), false, "temp file must be renamed away");
});

test("readTomlFile parses tables and reports unparseable files", () => {
  const good = tmpFile("config.toml", `model = "gpt-5"\n\n[mcp_servers.a]\ncommand = "uvx"\n`);
  assert.deepEqual(readTomlFile(good), {
    model: "gpt-5",
    mcp_servers: { a: { command: "uvx" } },
  });

  const bad = tmpFile("broken.toml", `model = "gpt-5"\n[unclosed`);
  assert.throws(() => readTomlFile(bad), ConfigParseError);
  assert.equal(readTomlFile(tmpFile("missing.toml")), null);
});
