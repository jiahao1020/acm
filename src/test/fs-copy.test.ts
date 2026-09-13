import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { copyDir, removeDir, isSkillDir, listSkillDirs } from "../utils/fs-copy";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "acm-fscopy-"));
}

function makeSkill(dir: string, name: string, extra?: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name}\n---\n`,
    "utf8"
  );
  for (const [rel, content] of Object.entries(extra ?? {})) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content, "utf8");
  }
}

test("isSkillDir detects a folder with SKILL.md", () => {
  const root = tmpRoot();
  const good = path.join(root, "good");
  const bad = path.join(root, "bad");
  makeSkill(good, "good");
  fs.mkdirSync(bad, { recursive: true });

  assert.equal(isSkillDir(good), true);
  assert.equal(isSkillDir(bad), false);
  assert.equal(isSkillDir(path.join(root, "missing")), false);
});

test("listSkillDirs returns only skill folders, sorted", () => {
  const root = tmpRoot();
  makeSkill(path.join(root, "zeta"), "zeta");
  makeSkill(path.join(root, "alpha"), "alpha");
  fs.mkdirSync(path.join(root, "not-a-skill"), { recursive: true });
  fs.writeFileSync(path.join(root, "loose.md"), "x");

  assert.deepEqual(listSkillDirs(root), ["alpha", "zeta"]);
});

test("listSkillDirs returns empty for a missing root", () => {
  assert.deepEqual(listSkillDirs(path.join(tmpRoot(), "nope")), []);
});

test("copyDir copies nested files", () => {
  const root = tmpRoot();
  const src = path.join(root, "src");
  makeSkill(src, "demo", { "scripts/run.sh": "echo hi\n", "refs/a.md": "A\n" });
  const dest = path.join(root, "out", "demo");

  copyDir(src, dest);

  assert.ok(fs.existsSync(path.join(dest, "SKILL.md")));
  assert.ok(fs.existsSync(path.join(dest, "scripts", "run.sh")));
  assert.ok(fs.existsSync(path.join(dest, "refs", "a.md")));
  assert.equal(fs.readFileSync(path.join(dest, "refs", "a.md"), "utf8"), "A\n");
});

test("copyDir dereferences symlinks into real files", () => {
  const root = tmpRoot();
  const real = path.join(root, "real", "linked-skill");
  makeSkill(real, "linked-skill", { "data.txt": "payload\n" });

  const linkParent = path.join(root, "links");
  fs.mkdirSync(linkParent, { recursive: true });
  const link = path.join(linkParent, "linked-skill");
  try {
    fs.symlinkSync(real, link, "junction");
  } catch {
    // Environment without symlink permission — skip rather than fail.
    return;
  }

  const dest = path.join(root, "dest", "linked-skill");
  copyDir(link, dest);

  assert.equal(fs.lstatSync(dest).isSymbolicLink(), false, "dest must be a real dir");
  assert.ok(fs.statSync(dest).isDirectory());
  assert.equal(fs.readFileSync(path.join(dest, "data.txt"), "utf8"), "payload\n");
});

test("copyDir throws when the source is missing", () => {
  const root = tmpRoot();
  assert.throws(() => copyDir(path.join(root, "nope"), path.join(root, "d")));
});

test("removeDir deletes a tree and is a no-op when absent", () => {
  const root = tmpRoot();
  const target = path.join(root, "gone");
  makeSkill(target, "gone");

  removeDir(target);
  assert.equal(fs.existsSync(target), false);
  removeDir(target); // must not throw
});
