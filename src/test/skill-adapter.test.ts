import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { SpecSkillAdapter } from "../skills/adapters";
import { isSkillDir } from "../utils/fs-copy";
import { withFakeHome, makeSkill } from "./helpers";

const CLAUDE_CODE_SKILLS = {
  id: "claude-code",
  displayName: "Claude Code",
  roots: [".claude/skills"],
};

test("installSkill copies a skill into the first skills root", () => {
  withFakeHome((home) => {
    const adapter = new SpecSkillAdapter(CLAUDE_CODE_SKILLS);
    const src = path.join(home, "src-skill");
    makeSkill(src, "demo", { "references/a.md": "A\n" });

    adapter.installSkill("demo", src);

    const installed = path.join(home, ".claude", "skills", "demo");
    assert.ok(isSkillDir(installed));
    assert.equal(fs.readFileSync(path.join(installed, "references", "a.md"), "utf8"), "A\n");
    assert.equal(adapter.findSkill("demo"), installed);
    assert.deepEqual(adapter.listSkills(), ["demo"]);
  });
});

test("installSkill refuses to overwrite an existing skill without force", () => {
  withFakeHome((home) => {
    const adapter = new SpecSkillAdapter(CLAUDE_CODE_SKILLS);
    const src = path.join(home, "src-skill");
    makeSkill(src, "demo");
    adapter.installSkill("demo", src);

    assert.throws(() => adapter.installSkill("demo", src), /already exists/);
    adapter.installSkill("demo", src, true); // force replaces it
    assert.deepEqual(adapter.listSkills(), ["demo"]);
  });
});

test("removeSkill deletes the folder and reports whether anything went", () => {
  withFakeHome((home) => {
    const adapter = new SpecSkillAdapter(CLAUDE_CODE_SKILLS);
    const src = path.join(home, "src-skill");
    makeSkill(src, "demo");
    adapter.installSkill("demo", src);

    const installed = path.join(home, ".claude", "skills", "demo");
    assert.equal(adapter.removeSkill("demo"), true);
    assert.equal(fs.existsSync(installed), false);
    assert.equal(adapter.removeSkill("demo"), false);
  });
});

test("a name that would escape the skills root is rejected", () => {
  withFakeHome((home) => {
    const adapter = new SpecSkillAdapter(CLAUDE_CODE_SKILLS);
    const src = path.join(home, "src-skill");
    makeSkill(src, "demo");

    for (const bad of ["..", ".", "", "nested/name", "nested\\name"]) {
      assert.throws(
        () => adapter.installSkill(bad, src),
        /invalid skill name/,
        `installSkill must reject ${JSON.stringify(bad)}`
      );
      assert.throws(
        () => adapter.removeSkill(bad),
        /invalid skill name/,
        `removeSkill must reject ${JSON.stringify(bad)}`
      );
    }

    // Nothing was created, and the client directory was not touched.
    assert.equal(fs.existsSync(path.join(home, ".claude", "skills")), false);
  });
});

test("removeSkill cannot delete the client directory through '..'", () => {
  withFakeHome((home) => {
    const adapter = new SpecSkillAdapter(CLAUDE_CODE_SKILLS);
    const root = path.join(home, ".claude", "skills");
    makeSkill(path.join(root, "demo"), "demo");

    assert.throws(() => adapter.removeSkill(".."), /invalid skill name/);
    assert.ok(fs.existsSync(path.join(home, ".claude")), "client dir must survive");
    assert.ok(fs.existsSync(path.join(root, "demo")), "existing skill must survive");
  });
});
