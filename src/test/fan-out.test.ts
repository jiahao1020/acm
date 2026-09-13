import { test } from "node:test";
import assert from "node:assert/strict";
import { fanOut, summarise } from "../utils/fan-out";
import { captureOutput } from "./helpers";

const client = (id: string, displayName = id) => ({ id, displayName });

test("fanOut counts each outcome and prints one line per client", async () => {
  const out = await captureOutput(() => {
    const counts = fanOut(
      [client("a", "Alpha"), client("b", "Beta"), client("c", "Gamma"), client("d", "Delta")],
      (c) => {
        if (c.id === "a") return { status: "done" };
        if (c.id === "b") return { status: "unchanged" };
        if (c.id === "c") return { status: "skipped", reason: "unsupported" };
        return { status: "conflict", reason: "already exists" };
      }
    );

    assert.deepEqual(counts, {
      done: 1,
      unchanged: 1,
      skipped: 1,
      conflict: 1,
      failed: 0,
    });
    return undefined;
  });

  assert.match(out, /✓ Alpha/);
  assert.match(out, /· Beta/);
  assert.match(out, /– Gamma\s+unsupported/);
  assert.match(out, /⚠ Delta\s+already exists/);
});

test("fanOut fails one client without aborting the rest", async () => {
  const reached: string[] = [];
  const out = await captureOutput(() => {
    const counts = fanOut([client("a"), client("b"), client("c")], (c) => {
      reached.push(c.id);
      if (c.id === "b") throw new Error("config is locked");
      return { status: "done" };
    });

    assert.equal(counts.done, 2, "the other two clients still ran");
    assert.equal(counts.failed, 1);
    return undefined;
  });

  assert.deepEqual(reached, ["a", "b", "c"], "every client is attempted");
  assert.match(out, /✗ b\s+config is locked/);
});

test("fanOut reports a thrown non-Error value without crashing", async () => {
  const out = await captureOutput(() => {
    const counts = fanOut([client("a")], () => {
      throw "a bare string"; // eslint-disable-line no-throw-literal
    });
    assert.equal(counts.failed, 1);
    return undefined;
  });

  assert.match(out, /✗ a\s+a bare string/);
});

test("fanOut prints a dry-run heading and an arrow instead of a tick", async () => {
  const out = await captureOutput(() => {
    const counts = fanOut([client("a", "Alpha")], () => ({
      status: "done",
      detail: "would add",
    }), { dryRun: true });
    // A dry run still tallies what would happen; the caller reports "would write N".
    assert.equal(counts.done, 1);
    return undefined;
  });

  assert.match(out, /Dry-run — no files written/);
  assert.match(out, /→ Alpha\s+would add/);
  assert.doesNotMatch(out, /✓/, "nothing was written, so no tick");
});

test("fanOut has no dry-run heading by default", async () => {
  const out = await captureOutput(() => {
    fanOut([client("a")], () => ({ status: "done" }));
    return undefined;
  });
  assert.doesNotMatch(out, /Dry-run/);
});

/* ------------------------------------------------------------------ */
/*  summarise                                                         */
/* ------------------------------------------------------------------ */

test("summarise joins the non-empty fragments with commas", () => {
  assert.equal(summarise(["2 already up to date", "", "1 failed"]), "2 already up to date, 1 failed");
});

test("summarise drops falsy fragments and returns an empty string when none remain", () => {
  assert.equal(summarise([]), "");
  assert.equal(summarise(["", false, undefined, 0]), "");
});

test("summarise keeps a lone fragment free of separators", () => {
  assert.equal(summarise(["3 skipped"]), "3 skipped");
});
