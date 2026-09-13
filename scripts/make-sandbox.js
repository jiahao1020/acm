// Sandbox fixture builder for skill tests. Not part of the shipped CLI.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", ".sandbox");
const home = path.join(root, "home");

function writeSkill(dir, name, extra) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} test skill\n---\n\n# ${name}\n`,
    "utf8"
  );
  for (const [rel, content] of Object.entries(extra ?? {})) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content, "utf8");
  }
}

fs.rmSync(root, { recursive: true, force: true });

// [CC]: skill-alpha + skill-beta
writeSkill(path.join(home, ".claude", "skills", "skill-alpha"), "skill-alpha", {
  "scripts/run.sh": "echo hi\n",
});
writeSkill(path.join(home, ".claude", "skills", "skill-beta"), "skill-beta", {
  "references/api.md": "ref content\n",
  "workbuddy.json": '{"private":"meta"}\n',
});

// Workbuddy: only skill-alpha
writeSkill(path.join(home, ".workbuddy", "skills", "skill-alpha"), "skill-alpha");

// Real skill outside home, exposed to ZCode through a symlink
const realGamma = path.join(root, "real-skills", "skill-gamma");
writeSkill(realGamma, "skill-gamma");

// Client dirs so detect() passes
for (const d of [".claude", ".workbuddy", ".zcode", ".config/opencode", ".codex"]) {
  fs.mkdirSync(path.join(home, d), { recursive: true });
}

// ZCode sees skill-gamma via a junction/symlink
const linkPath = path.join(home, ".zcode", "skills", "skill-gamma");
fs.mkdirSync(path.dirname(linkPath), { recursive: true });
try {
  fs.symlinkSync(realGamma, linkPath, "junction");
  console.log("symlink: created");
} catch (e) {
  console.log("symlink: FAILED -", e.message);
}

console.log("sandbox ready at", root);
