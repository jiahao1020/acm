import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAddArgs, rawAddTokens } from "../commands/add-args";

test("parses name plus plain command and args", () => {
  const r = parseAddArgs(["fs", "npx", "-y", "pkg", "/tmp"]);
  assert.equal(r.name, "fs");
  assert.deepEqual(r.command, ["npx", "-y", "pkg", "/tmp"]);
  assert.deepEqual(r.env, []);
  assert.equal(r.url, undefined);
});

test("extracts --url for remote servers", () => {
  const r = parseAddArgs(["remote", "--url", "https://example.com/mcp"]);
  assert.equal(r.name, "remote");
  assert.equal(r.url, "https://example.com/mcp");
  assert.deepEqual(r.command, []);
});

test("extracts --client filter", () => {
  const r = parseAddArgs(["s", "npx", "-y", "pkg", "--client", "cursor,cline"]);
  assert.equal(r.client, "cursor,cline");
  assert.deepEqual(r.command, ["npx", "-y", "pkg"]);
});

test("collects repeated -e env vars", () => {
  const r = parseAddArgs(["s", "-e", "A=1", "--env", "B=2", "npx", "pkg"]);
  assert.deepEqual(r.env, ["A=1", "B=2"]);
  assert.deepEqual(r.command, ["npx", "pkg"]);
});

test("extracts --cwd", () => {
  const r = parseAddArgs(["s", "--cwd", "/work", "python", "-m", "srv"]);
  assert.equal(r.cwd, "/work");
  assert.deepEqual(r.command, ["python", "-m", "srv"]);
});

test("literal -- forces remaining tokens into command args", () => {
  const r = parseAddArgs(["s", "--", "python", "-m", "srv", "--client", "x"]);
  assert.equal(r.client, undefined);
  assert.deepEqual(r.command, ["python", "-m", "srv", "--client", "x"]);
});

test("preserves unknown server flags", () => {
  const r = parseAddArgs(["s", "npx", "-y", "pkg", "--foo", "--bar=baz"]);
  assert.deepEqual(r.command, ["npx", "-y", "pkg", "--foo", "--bar=baz"]);
});

test("handles missing name gracefully", () => {
  const r = parseAddArgs([]);
  assert.equal(r.name, "");
});

test("accepts --flag=value for acm's own flags", () => {
  const r = parseAddArgs([
    "s",
    "--url=https://example.com/mcp",
    "--cwd=/work",
    "--client=cursor,cline",
    "--env=A=1",
  ]);
  assert.equal(r.url, "https://example.com/mcp");
  assert.equal(r.cwd, "/work");
  assert.equal(r.client, "cursor,cline");
  assert.deepEqual(r.env, ["A=1"]);
  assert.deepEqual(r.command, []);
  assert.deepEqual(r.errors, []);
});

test("reports a flag with no value instead of silently dropping it", () => {
  const r = parseAddArgs(["s", "npx", "pkg", "-e"]);
  assert.deepEqual(r.env, [], "no undefined env entry");
  assert.deepEqual(r.errors, ["-e requires a value"]);

  const url = parseAddArgs(["s", "--url"]);
  assert.equal(url.url, undefined);
  assert.deepEqual(url.errors, ["--url requires a value"]);
});

test("does not swallow the next flag as a value", () => {
  const r = parseAddArgs(["s", "--url", "--client", "cursor"]);
  assert.equal(r.url, undefined);
  assert.deepEqual(r.errors, ["--url requires a value"]);
  assert.equal(r.client, "cursor");
});

test("parses --force and --dry-run", () => {
  const r = parseAddArgs(["s", "npx", "-y", "pkg", "--force", "--dry-run"]);
  assert.equal(r.force, true);
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.command, ["npx", "-y", "pkg"]);
});

test("rawAddTokens extracts tokens after the add subcommand", () => {
  const argv = ["mcp", "add", "fs", "npx", "-y", "pkg"];
  assert.deepEqual(rawAddTokens(argv), ["fs", "npx", "-y", "pkg"]);
});

test("rawAddTokens returns empty when add is absent", () => {
  assert.deepEqual(rawAddTokens(["mcp", "list"]), []);
});
