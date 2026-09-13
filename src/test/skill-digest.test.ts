import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { digestSkillDir, SkillDigestCache } from "../utils/skill-digest";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acm-digest-"));
}

function writeFile(dir: string, rel: string, content: string): void {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

/** A skill whose files are created in the given order, to test order independence. */
function makeSkill(root: string, order: string[]): string {
  for (const rel of order) {
    writeFile(root, rel, `content of ${rel}\n`);
  }
  return root;
}

test("identical skills hash the same regardless of creation order", () => {
  const a = makeSkill(path.join(tmpRoot(), "a"), ["SKILL.md", "references/api.md"]);
  const b = makeSkill(path.join(tmpRoot(), "b"), ["references/api.md", "SKILL.md"]);
  assert.equal(digestSkillDir(a), digestSkillDir(b));
});

test("changed content changes the digest", () => {
  const root = tmpRoot();
  const a = makeSkill(path.join(root, "a"), ["SKILL.md"]);
  const b = makeSkill(path.join(root, "b"), ["SKILL.md"]);
  assert.equal(digestSkillDir(a), digestSkillDir(b));

  writeFile(b, "SKILL.md", "different content\n");
  assert.notEqual(digestSkillDir(a), digestSkillDir(b));
});

test("a renamed, missing or extra file changes the digest", () => {
  const root = tmpRoot();
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  writeFile(a, "SKILL.md", "same\n");
  writeFile(a, "extra.md", "same\n");
  writeFile(b, "SKILL.md", "same\n");
  writeFile(b, "other.md", "same\n");
  assert.notEqual(digestSkillDir(a), digestSkillDir(b), "file name differs");

  fs.renameSync(path.join(b, "other.md"), path.join(b, "extra.md"));
  assert.equal(digestSkillDir(a), digestSkillDir(b), "same names and contents");

  fs.rmSync(path.join(b, "extra.md"));
  assert.notEqual(digestSkillDir(a), digestSkillDir(b), "file missing");
});

test("file names are part of the digest, not just contents", () => {
  const root = tmpRoot();
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  writeFile(a, "one.md", "same\n");
  writeFile(b, "two.md", "same\n");
  assert.notEqual(digestSkillDir(a), digestSkillDir(b));
});

test(".git is ignored so a clone and a copy compare equal", () => {
  const root = tmpRoot();
  const a = makeSkill(path.join(root, "a"), ["SKILL.md"]);
  const b = makeSkill(path.join(root, "b"), ["SKILL.md"]);
  writeFile(b, ".git/config", "[core]\n");

  assert.equal(digestSkillDir(a), digestSkillDir(b));
});

test("a symlinked skill hashes like the real folder", () => {
  const root = tmpRoot();
  const real = makeSkill(path.join(root, "real"), ["SKILL.md", "data.txt"]);
  const link = path.join(root, "link");
  try {
    fs.symlinkSync(real, link, "junction");
  } catch {
    return; // environment without symlink permission
  }

  assert.equal(digestSkillDir(link), digestSkillDir(real));
});

test("a missing directory does not throw", () => {
  const digest = digestSkillDir(path.join(tmpRoot(), "nope"));
  assert.equal(typeof digest, "string");
  assert.equal(digest.length, 64);
});

/* ------------------------------------------------------------------ */
/*  SkillDigestCache                                                  */
/* ------------------------------------------------------------------ */

test("the cache returns the same digest for a repeated path", () => {
  const dir = makeSkill(path.join(tmpRoot(), "a"), ["SKILL.md"]);
  const cache = new SkillDigestCache();

  assert.equal(cache.of(dir), digestSkillDir(dir));
  assert.equal(cache.of(dir), cache.of(dir));
});

test("the cache hashes each distinct path only once", () => {
  const root = tmpRoot();
  const a = makeSkill(path.join(root, "a"), ["SKILL.md"]);
  const b = makeSkill(path.join(root, "b"), ["SKILL.md"]);

  // Counting calls to the injectable digest is how we observe "did we walk the
  // tree again?". Patching fs is not an option: its methods are read-only
  // getters on modern Node (a TypeError, not a silent no-op).
  const calls: string[] = [];
  const cache = new SkillDigestCache((dir) => {
    calls.push(dir);
    return digestSkillDir(dir);
  });

  for (let i = 0; i < 5; i++) {
    cache.of(a);
    cache.of(b);
  }

  assert.deepEqual(calls.sort(), [a, b].sort(), "one pass per folder, not per call");
});

test("the cache distinguishes two folders with different content", () => {
  const root = tmpRoot();
  const a = makeSkill(path.join(root, "a"), ["SKILL.md"]);
  const b = makeSkill(path.join(root, "b"), ["SKILL.md"]);
  writeFile(b, "SKILL.md", "changed\n");

  const cache = new SkillDigestCache();
  assert.notEqual(cache.of(a), cache.of(b));
});

test("the cache reports null for a folder that does not exist", () => {
  const cache = new SkillDigestCache();
  assert.equal(cache.of(path.join(tmpRoot(), "nope")), null);
});
