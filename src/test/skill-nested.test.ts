/**
 * The nested (category-grouped) skills layout.
 *
 * Every client but Hermes uses `<root>/<skill>/SKILL.md`. Hermes groups skills
 * into category folders, so the same code has to find and place skills one level
 * deeper. Getting this wrong is quiet rather than loud — a flat scan reports the
 * *categories* as skills and hides every real one — so it is pinned here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import {
  listSkillDirs,
  listSkillDirsAt,
  isSkillDir,
} from "../utils/fs-copy";
import { HermesSkillAdapter } from "../skills/adapters";
import { SpecSkillAdapter } from "../skills/adapters";
import { SkillAdapter } from "../skills/skill-adapter";
import { withFakeHome, makeSkill } from "./helpers";

/** Build a Hermes-style tree: <root>/<category>/<skill>/SKILL.md */
function makeNested(home: string): string {
  const root = path.join(home, "AppData", "Local", "hermes", "skills");
  makeSkill(path.join(root, "srm-business", "pangu-prod-data-fix"), "pangu-prod-data-fix", {
    "references/notes.md": "hi",
  });
  makeSkill(path.join(root, "srm-business", "log-search-check"), "log-search-check");
  makeSkill(path.join(root, "devops", "kanban-worker"), "kanban-worker");
  // A flat skill at the root, which Hermes also allows.
  makeSkill(path.join(root, "yuanbao"), "yuanbao");
  // Metadata files Hermes keeps beside the categories.
  fs.writeFileSync(path.join(root, ".bundled_manifest"), "x:1\n", "utf8");
  fs.writeFileSync(path.join(root, ".usage.json"), "{}", "utf8");
  fs.mkdirSync(path.join(root, ".curator_state"), { recursive: true });
  return root;
}

test("listSkillDirsAt depth 0 does not descend into category folders", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // The flat scan is what every other client uses; on this tree it should see
    // only the genuinely-flat skill, proving the depth parameter is what makes
    // the nested case work rather than a laxer check.
    assert.deepEqual(listSkillDirs(root), ["yuanbao"]);
  });
});

test("listSkillDirsAt depth 1 finds nested skills and the flat one", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    assert.deepEqual(listSkillDirsAt(root, 1), [
      "kanban-worker",
      "log-search-check",
      "pangu-prod-data-fix",
      "yuanbao",
    ]);
  });
});

test("listSkillDirsAt ignores hidden metadata entries", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const names = listSkillDirsAt(root, 1);
    assert.equal(names.some((n) => n.startsWith(".")), false);
  });
});

test("listSkillDirsAt returns [] for a missing root", () => {
  assert.deepEqual(listSkillDirsAt(path.join("/nope", "missing"), 1), []);
});

test("a category folder is not itself a skill", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    assert.equal(isSkillDir(path.join(root, "srm-business")), false);
  });
});

test("the Hermes skill adapter lists nested skills", async () => {
  await withFakeHome(async (home) => {
    makeNested(home);
    const adapter = new HermesSkillAdapter();
    assert.deepEqual(adapter.listSkills(), [
      "kanban-worker",
      "log-search-check",
      "pangu-prod-data-fix",
      "yuanbao",
    ]);
  });
});

test("the Hermes skill adapter finds a nested skill by name", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const found = new HermesSkillAdapter().findSkill("pangu-prod-data-fix");
    assert.equal(found, path.join(root, "srm-business", "pangu-prod-data-fix"));
  });
});

test("the Hermes skill adapter finds a flat skill too", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    assert.equal(new HermesSkillAdapter().findSkill("yuanbao"), path.join(root, "yuanbao"));
  });
});

test("Hermes install places a new skill in the root", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const src = path.join(home, "incoming-skill");
    makeSkill(src, "brand-new");

    new HermesSkillAdapter().installSkill("brand-new", src);

    assert.equal(isSkillDir(path.join(root, "brand-new")), true);
    assert.deepEqual(new HermesSkillAdapter().listSkills().includes("brand-new"), true);
  });
});

test("Hermes reinstall replaces the skill where it already lives", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const nested = path.join(root, "srm-business", "log-search-check");
    assert.equal(fs.existsSync(path.join(nested, "SKILL.md")), true);

    const src = path.join(home, "updated");
    makeSkill(src, "log-search-check", { "extra.md": "new" });

    new HermesSkillAdapter().installSkill("log-search-check", src, true);

    // It stayed in its category rather than being stranded at the root, which
    // would leave two copies that list reports as drift.
    assert.equal(fs.existsSync(path.join(nested, "extra.md")), true);
    assert.equal(fs.existsSync(path.join(root, "log-search-check")), false);
  });
});

test("Hermes install refuses to overwrite without force", async () => {
  await withFakeHome(async (home) => {
    makeNested(home);
    const src = path.join(home, "incoming");
    makeSkill(src, "kanban-worker");
    assert.throws(
      () => new HermesSkillAdapter().installSkill("kanban-worker", src),
      /already exists/
    );
  });
});

test("Hermes remove deletes a nested skill", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const removed = new HermesSkillAdapter().removeSkill("pangu-prod-data-fix");
    assert.equal(removed, true);
    assert.equal(
      fs.existsSync(path.join(root, "srm-business", "pangu-prod-data-fix")),
      false
    );
    // The category folder itself must survive: it is Hermes' structure, not
    // acm's, and other skills live in it.
    assert.equal(fs.existsSync(path.join(root, "srm-business")), true);
  });
});

test("Hermes remove reports false for a skill that is not there", async () => {
  await withFakeHome(async (home) => {
    makeNested(home);
    assert.equal(new HermesSkillAdapter().removeSkill("no-such-skill"), false);
  });
});

test("Hermes skills are not treated as a catalog, so sync can target them", async () => {
  await withFakeHome(async (home) => {
    makeNested(home);
    // A catalog is excluded from sync as both source and target. Hermes must not
    // be, or skills could never be pushed into it — the main reason to add it.
    // Asserted through the interface, which is the type sync's guard sees.
    const adapter: SkillAdapter = new HermesSkillAdapter();
    assert.ok(!adapter.isCatalog?.());
  });
});

test("a flat client still lists only its own skills after the depth change", async () => {
  await withFakeHome(async (home) => {
    const root = path.join(home, ".workbuddy", "skills");
    makeSkill(path.join(root, "alpha"), "alpha");
    makeSkill(path.join(root, "beta"), "beta");
    // A stray nested folder must not be picked up by a depth-0 client.
    makeSkill(path.join(root, "category", "nested"), "nested");

    const adapter = new SpecSkillAdapter({
      id: "workbuddy",
      displayName: "Workbuddy",
      roots: [".workbuddy/skills"],
    });
    assert.deepEqual(adapter.listSkills(), ["alpha", "beta"]);
  });
});
