import { test } from "node:test";
import assert from "node:assert/strict";
import { selectClientIds, unknownClientMessage } from "../utils/targets";

const CLIENTS = [{ id: "cursor" }, { id: "cline" }, { id: "zcode" }];

test("no --client keeps every available client", () => {
  const { targets, unknown } = selectClientIds(CLIENTS);
  assert.equal(targets.length, 3);
  assert.deepEqual(unknown, []);
});

test("filters to the requested ids", () => {
  const { targets, unknown } = selectClientIds(CLIENTS, "cursor, zcode");
  assert.deepEqual(
    targets.map((c) => c.id),
    ["cursor", "zcode"]
  );
  assert.deepEqual(unknown, []);
});

test("reports ids that match nothing instead of dropping them silently", () => {
  const { targets, unknown } = selectClientIds(CLIENTS, "cursro,cursor");
  assert.deepEqual(
    targets.map((c) => c.id),
    ["cursor"]
  );
  assert.deepEqual(unknown, ["cursro"]);
});

test("unknownClientMessage lists what is available", () => {
  const message = unknownClientMessage(["typo"], CLIENTS);
  assert.match(message, /typo/);
  assert.match(message, /cursor, cline, zcode/);
});
