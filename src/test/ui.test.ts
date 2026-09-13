/**
 * `ui.column` exists so a column of names lines up without anyone guessing a
 * width. These tests pin the two properties that matter: every row is the same
 * length, and the width follows the data rather than a constant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { column, supportedList } from "../utils/ui";

test("column pads every name to the longest one", () => {
  const label = column(["Cursor", "Claude Desktop", "Codex"], (s) => s);
  assert.equal(label("Cursor"), "Cursor        ");
  assert.equal(label("Claude Desktop"), "Claude Desktop");
  assert.equal(label("Codex"), "Codex         ");
});

test("column widths agree across rows, which is the point of measuring", () => {
  const names = ["Cursor", "Claude Desktop", "Codex"];
  const label = column(names, (s) => s);
  const widths = new Set(names.map((n) => label(n).length));
  assert.equal(widths.size, 1);
});

test("column does not truncate a name longer than the others", () => {
  const label = column(["A", "A very long client display name"], (s) => s);
  assert.equal(label("A very long client display name"), "A very long client display name");
});

test("column handles a single item and an empty list", () => {
  assert.equal(column(["Solo"], (s) => s)("Solo"), "Solo");
  const empty = column([] as string[], (s) => s);
  assert.equal(typeof empty, "function");
});

test("column reads the name through the accessor, not the item", () => {
  const label = column([{ id: "cursor", displayName: "Cursor" }], (c) => c.displayName);
  assert.equal(label({ id: "cursor", displayName: "Cursor" }), "Cursor");
});

test("supportedList is sorted, so the message does not depend on registry order", () => {
  assert.equal(supportedList(["ZCode", "Cursor", "Claude Code"]), "Supported: Claude Code, Cursor, ZCode");
});

test("supportedList de-duplicates names shared by two adapters", () => {
  assert.equal(supportedList(["ZCode", "ZCode"]), "Supported: ZCode");
});
