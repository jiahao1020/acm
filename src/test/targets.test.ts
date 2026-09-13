import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectClientIds,
  unknownClientMessage,
  emptyClientMessage,
} from "../utils/targets";

const CLIENTS = [{ id: "cursor" }, { id: "cline" }, { id: "zcode" }];

test("no --client keeps every available client", () => {
  const { targets, unknown, empty } = selectClientIds(CLIENTS);
  assert.equal(targets.length, 3);
  assert.deepEqual(unknown, []);
  assert.equal(empty, false);
});

test("filters to the requested ids", () => {
  const { targets, unknown, empty } = selectClientIds(CLIENTS, "cursor, zcode");
  assert.deepEqual(
    targets.map((c) => c.id),
    ["cursor", "zcode"]
  );
  assert.deepEqual(unknown, []);
  assert.equal(empty, false);
});

test("reports ids that match nothing instead of dropping them silently", () => {
  const { targets, unknown } = selectClientIds(CLIENTS, "cursro,cursor");
  assert.deepEqual(
    targets.map((c) => c.id),
    ["cursor"]
  );
  assert.deepEqual(unknown, ["cursro"]);
});

test("a value with no ids is empty, not 'every client'", () => {
  // Treating this as "all clients" would silently widen a command the user
  // meant to narrow.
  for (const value of [",,,", "", "  ", ", ,"]) {
    const { targets, unknown, empty } = selectClientIds(CLIENTS, value);
    assert.equal(empty, true, `${JSON.stringify(value)} must report empty`);
    assert.deepEqual(targets, [], `${JSON.stringify(value)} must select nothing`);
    assert.deepEqual(unknown, []);
  }
});

test("unknownClientMessage lists what is available", () => {
  const message = unknownClientMessage(["typo"], CLIENTS);
  assert.match(message, /typo/);
  assert.match(message, /cursor, cline, zcode/);
});

test("emptyClientMessage explains the problem and lists what is available", () => {
  const message = emptyClientMessage(CLIENTS);
  assert.match(message, /without any client id/);
  assert.match(message, /cursor, cline, zcode/);
});
