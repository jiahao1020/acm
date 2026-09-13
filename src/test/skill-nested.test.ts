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
    // User-owned: the marker Hermes writes for an imported skill.
    "_user_meta.json": '{"name":"pangu-prod-data-fix","source":"userImport"}',
  });
  makeSkill(path.join(root, "srm-business", "log-search-check"), "log-search-check", {
    "_user_meta.json": '{"name":"log-search-check","source":"userImport"}',
  });
  // Bundled with Hermes: no provenance marker of its own, which is all the
  // rule needs to treat it as bundled.
  makeSkill(path.join(root, "devops", "kanban-worker"), "kanban-worker");
  // A flat skill at the root, which Hermes also allows.
  makeSkill(path.join(root, "yuanbao"), "yuanbao", {
    "_user_meta.json": '{"name":"yuanbao","source":"userImport"}',
  });
  // Metadata files Hermes keeps beside the categories. The manifest is present
  // because the real root has one, but classification does not consult it.
  fs.writeFileSync(path.join(root, ".bundled_manifest"), "kanban-worker:1\n", "utf8");
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
    // kanban-worker carries no provenance marker, so it is bundled and stays
    // out.
    assert.deepEqual(adapter.listSkills(), [
      "log-search-check",
      "pangu-prod-data-fix",
      "yuanbao",
    ]);
    // …but it is still on disk, and listAllSkills is what proves it.
    assert.deepEqual(adapter.listAllSkills(), [
      "kanban-worker",
      "log-search-check",
      "pangu-prod-data-fix",
      "yuanbao",
    ]);
  });
});

test("a bundled skill is excluded from listSkills but still resolvable", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const adapter = new HermesSkillAdapter();

    assert.equal(adapter.isBundledSkill("kanban-worker"), true);
    assert.equal(adapter.listSkills().includes("kanban-worker"), false);

    // Exclusion is about the *comparison*, not about hiding the skill: remove
    // still has to be able to find and delete it.
    assert.equal(
      adapter.findSkill("kanban-worker"),
      path.join(root, "devops", "kanban-worker")
    );
    assert.equal(adapter.removeSkill("kanban-worker"), true);
  });
});

test("a marketplace skill counts as the user's, not as bundled", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // Hermes installs marketplace skills next to its own, with this marker.
    makeSkill(path.join(root, "web", "agent-browser-core"), "agent-browser-core", {
      "_skillhub_meta.json": '{"name":"网页自动化","source":"marketplace"}',
    });
    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("agent-browser-core"), false);
    assert.equal(adapter.listSkills().includes("agent-browser-core"), true);
  });
});

test("a skill with no provenance marker is treated as bundled", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // No provenance marker of any kind. Hermes' own catalogue is large and
    // mostly undocumented, so this is the common case and has to be excluded —
    // leaving it in would make every other client look broken.
    makeSkill(path.join(root, "research", "blogwatcher"), "blogwatcher");
    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("blogwatcher"), true);
    assert.equal(adapter.listSkills().includes("blogwatcher"), false);
  });
});

test("a user category keeps a skill that has no marker at all", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // The real case this exists for: the user's own SRM skills, some of which
    // carry no _user_meta.json and no agent_created flag.
    makeSkill(path.join(root, "srm-business", "srm-buried-point"), "srm-buried-point");
    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("srm-buried-point"), false);
    assert.equal(adapter.listSkills().includes("srm-buried-point"), true);
  });
});

test("agent_created frontmatter marks a skill as the user's", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    makeSkill(path.join(root, "research", "authored"), "authored", {
      "SKILL.md":
        "---\nname: authored\ndescription: x\nagent_created: true\n---\n\n# Authored\n",
    });
    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("authored"), false);
  });
});

test("agent_created must be true, not merely present", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    makeSkill(path.join(root, "research", "not-authored"), "not-authored", {
      "SKILL.md": "---\nname: not-authored\nagent_created: false\n---\n\n# Nope\n",
    });
    assert.equal(new HermesSkillAdapter().isBundledSkill("not-authored"), true);
  });
});

test("classification agrees whether or not the caller supplies the path", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    makeSkill(path.join(root, "srm-business", "srm-buried-point"), "srm-buried-point");
    makeSkill(path.join(root, "research", "blogwatcher"), "blogwatcher");
    const adapter = new HermesSkillAdapter();

    for (const [name, expected] of [
      ["kanban-worker", true], // no marker at all
      ["blogwatcher", true], // no marker at all
      ["srm-buried-point", false], // user category
      ["pangu-prod-data-fix", false], // _user_meta.json
    ] as const) {
      const dir = adapter.findSkill(name);
      assert.equal(dir, adapter.findSkill(name), `${name} resolves consistently`);
      assert.equal(
        adapter.isBundledSkill(name, dir!),
        adapter.isBundledSkill(name),
        `${name}: path-backed and name-only classification must agree`
      );
      assert.equal(adapter.isBundledSkill(name, dir!), expected, `${name} expected`);
    }
  });
});

test("a path-backed call does not resolve the name again", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    makeSkill(path.join(root, "research", "blogwatcher"), "blogwatcher");
    const adapter = new HermesSkillAdapter();

    // The whole point of the optional path is to avoid a per-skill tree walk.
    // Counting the calls is the only way to see that from outside.
    let walks = 0;
    const original = adapter.findSkill.bind(adapter);
    (adapter as { findSkill: (n: string) => string | null }).findSkill = (n: string) => {
      walks++;
      return original(n);
    };

    const dir = path.join(root, "research", "blogwatcher");
    adapter.isBundledSkill("blogwatcher", dir);
    assert.equal(walks, 0, "supplying the path must skip the lookup");

    adapter.isBundledSkill("blogwatcher");
    assert.equal(walks, 1, "omitting the path still resolves, for single lookups");
  });
});

test("the category rule outranks every marker", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // A user category is the strongest signal: it wins even against a manifest
    // entry, so a bundled name the user has adopted inside their own category
    // stays visible.
    makeSkill(path.join(root, "srm-business", "adopted"), "adopted");
    fs.appendFileSync(path.join(root, ".bundled_manifest"), "adopted:1\n");
    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("adopted"), false);
    assert.equal(adapter.listSkills().includes("adopted"), true);
  });
});

test("the bundled manifest does not drive classification", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // The manifest is a snapshot of a past Hermes version — 58 names for 113
    // skills on the machine this was written against — so it must not decide.
    // Removing it changes nothing, and editing it changes nothing either.
    makeSkill(path.join(root, "research", "blogwatcher"), "blogwatcher");
    const adapter = new HermesSkillAdapter();
    const before = adapter.listSkills();

    fs.rmSync(path.join(root, ".bundled_manifest"));
    assert.deepEqual(new HermesSkillAdapter().listSkills(), before);

    fs.writeFileSync(
      path.join(root, ".bundled_manifest"),
      "pangu-prod-data-fix:1\nblogwatcher:1\n",
      "utf8"
    );
    const after = new HermesSkillAdapter().listSkills();
    assert.deepEqual(after, before, "manifest edits must not change the result");
    assert.equal(after.includes("pangu-prod-data-fix"), true);
    assert.equal(after.includes("blogwatcher"), false);
  });
});

test("a re-installed bundled skill becomes the user's", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const src = path.join(home, "incoming");
    makeSkill(src, "kanban-worker", { "extra.md": "x" });

    const adapter = new HermesSkillAdapter();
    assert.equal(adapter.isBundledSkill("kanban-worker"), true);
    // The installed copy joins the same category as the one it replaces and
    // gains a marker, so the name now belongs to the user. Keying off the
    // manifest's name list instead would have kept hiding it.
    adapter.installSkill("kanban-worker", src, true);
    assert.equal(adapter.isBundledSkill("kanban-worker"), false);
    assert.equal(adapter.listSkills().includes("kanban-worker"), true);
  });
});

test("an unknown name is never reported as bundled", async () => {
  await withFakeHome(async () => {
    // Guards the findSkill()-returns-null path: absent is not bundled.
    assert.equal(new HermesSkillAdapter().isBundledSkill("no-such-skill"), false);
  });
});

test("the same name in two categories is one skill, not two", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    makeSkill(path.join(root, "srm-business", "dup"), "dup");
    makeSkill(path.join(root, "devops", "dup"), "dup");

    const adapter = new HermesSkillAdapter();
    // Regression: deduping by path rather than by name let a same-named skill
    // appear twice, which double-counted it and broke the hidden-count maths.
    assert.deepEqual(
      adapter.listAllSkills().filter((n) => n === "dup"),
      ["dup"]
    );
    assert.deepEqual(
      adapter.listSkills().filter((n) => n === "dup"),
      ["dup"]
    );
  });
});

test("a name kept visible when any of its locations is the user's", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    // A bundled location (devops, no marker) plus a user location.
    makeSkill(path.join(root, "devops", "clash"), "clash");
    makeSkill(path.join(root, "srm-business", "clash"), "clash");

    const adapter = new HermesSkillAdapter();
    // Erring towards visible: the user's copy must not be hidden because a
    // same-named bundled skill exists elsewhere.
    assert.equal(adapter.listSkills().includes("clash"), true);
  });
});

test("a flat client has no bundled skills", async () => {
  await withFakeHome(async (home) => {
    const root = path.join(home, ".workbuddy", "skills");
    makeSkill(path.join(root, "alpha"), "alpha");
    const adapter = new SpecSkillAdapter({
      id: "workbuddy",
      displayName: "Workbuddy",
      roots: [".workbuddy/skills"],
    });
    assert.equal(adapter.isBundledSkill("alpha"), false);
    assert.deepEqual(adapter.listAllSkills(), ["alpha"]);
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

test("Hermes install stamps provenance so the new skill is not hidden", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const src = path.join(home, "incoming-skill");
    makeSkill(src, "brand-new");

    new HermesSkillAdapter().installSkill("brand-new", src);

    // Without a marker, isBundledSkill would classify it as bundled and it
    // would vanish from the comparison the instant it was installed.
    const dest = path.join(root, "brand-new");
    assert.equal(fs.existsSync(path.join(dest, "_user_meta.json")), true);
    assert.equal(new HermesSkillAdapter().isBundledSkill("brand-new"), false);
  });
});

test("Hermes install does not overwrite an existing provenance marker", async () => {
  await withFakeHome(async (home) => {
    const root = makeNested(home);
    const src = path.join(home, "incoming");
    const meta = '{"source":"userImport","keep":"me"}';
    makeSkill(src, "stamped", { "_user_meta.json": meta });

    new HermesSkillAdapter().installSkill("stamped", src);

    // The source's own marker is the truth; acm must not clobber it with its
    // own bookkeeping.
    assert.equal(
      fs.readFileSync(path.join(root, "stamped", "_user_meta.json"), "utf-8"),
      meta
    );
  });
});

test("a flat client does not get a provenance file it does not use", async () => {
  await withFakeHome(async (home) => {
    const root = path.join(home, ".workbuddy", "skills");
    const src = path.join(home, "incoming");
    makeSkill(src, "plain");
    const adapter = new SpecSkillAdapter({
      id: "workbuddy",
      displayName: "Workbuddy",
      roots: [".workbuddy/skills"],
    });
    adapter.installSkill("plain", src);
    assert.equal(fs.existsSync(path.join(root, "plain", "_user_meta.json")), false);
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
