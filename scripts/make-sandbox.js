// Sandbox fixture builder. Not part of the shipped CLI.
//
// Builds a throwaway `$HOME` tree that looks like a machine with a handful of
// AI clients installed, so tests (and manual poking) can run acm against real
// config files without touching the developer's own.
//
// Two modes:
//   node scripts/make-sandbox.js                    → .sandbox/ (skill fixtures)
//   node scripts/make-sandbox.js --out <dir>        → <dir> (same tree)
//   node scripts/make-sandbox.js --out <dir> --mcp  → also seed MCP configs
//
// With `--mcp` it also prints a JSON snapshot of `{relPath: sha256}` for every
// file it created, terminated by a `---SNAPSHOT---` line. The E2E suite diffs
// the tree against that snapshot afterwards, which is what turns "acm only
// touched what it said it would" into an assertion instead of a hope.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
function flagValue(name) {
  const idx = args.indexOf(name);
  return idx === -1 ? undefined : args[idx + 1];
}
const outArg = flagValue("--out");
const seedMcp = args.includes("--mcp");

const root = outArg ? path.resolve(outArg) : path.resolve(__dirname, "..", ".sandbox");
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

function write(rel, content) {
  const f = path.join(home, ...rel.split("/"));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content, "utf8");
}

fs.rmSync(root, { recursive: true, force: true });

/* ------------------------------------------------------------------ */
/*  Skills                                                             */
/* ------------------------------------------------------------------ */

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
let symlinkOk = true;
try {
  fs.symlinkSync(realGamma, linkPath, "junction");
} catch (e) {
  // Creating one needs Developer Mode (or an elevated shell) on Windows.
  // Losing this case costs coverage, not correctness — say so and carry on.
  symlinkOk = false;
  process.stderr.write(`symlink: FAILED - ${e.message}\n`);
}

/* ------------------------------------------------------------------ */
/*  MCP configs                                                        */
/* ------------------------------------------------------------------ */

// Deliberately *not* uniform: three clients carry servers a fourth lacks, and
// each file holds unrelated settings that must survive every acm write. The
// snapshots below are what the E2E "nothing else changed" assertion is
// measured against, so hand-written keys and comments are the point, not noise.
if (seedMcp) {
  write(
    ".claude.json",
    JSON.stringify(
      {
        // Claude Code's global config is a mixed bag in practice; a rewrite
        // that rebuilt it from scratch would take these with it.
        numStartups: 42,
        theme: "dark",
        mcpServers: {
          "acm-e2e-alpha": { command: "npx", args: ["-y", "alpha-pkg"] },
          "acm-e2e-conflict": { command: "legacy-cmd", args: ["--old"] },
        },
      },
      null,
      2
    ) + "\n"
  );

  // TOML with a table unrelated to MCP, so `mcp add` has to be a read-modify-write.
  write(
    ".codex/config.toml",
    ["model = \"gpt-5-codex\"", "", "[mcp_servers.\"acm-e2e-alpha\"]", 'command = "npx"', 'args = ["-y", "alpha-pkg"]', ""].join(
      "\n"
    )
  );

  // YAML holding Hermes' whole settings tree, of which `mcp_servers` is one branch.
  write(
    path.posix.join("AppData", "Local", "hermes", "config.yaml"),
    [
      "model: claude-sonnet-4",
      "providers:",
      "  - name: anthropic",
      "mcp_servers:",
      "  acm-e2e-alpha:",
      "    command: npx",
      "    args:",
      "      - -y",
      "      - alpha-pkg",
      "",
    ].join("\n")
  );

  // OpenCode: nested schema, `$schema` that must survive, and a stale `url` on
  // a local entry that the adapter is supposed to drop.
  write(
    ".config/opencode/opencode.json",
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        theme: "dark",
        mcp: {
          "acm-e2e-alpha": {
            type: "local",
            command: ["npx", "-y", "alpha-pkg"],
            enabled: true,
          },
        },
      },
      null,
      2
    ) + "\n"
  );

  // A client whose config is broken on purpose: `mcp list` must report it as
  // unreadable while still showing every other client's servers.
  write(".cursor/mcp.json", '{ "mcpServers": { "truncated": ');
}

/* ------------------------------------------------------------------ */
/*  Snapshot                                                           */
/* ------------------------------------------------------------------ */

/** sha256 of every file under `dir`, keyed by home-relative POSIX path. */
function snapshot(dir) {
  const out = {};
  const walk = (abs) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name);
      // Junctions/symlinks are followed so the snapshot covers the real file.
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else {
        const rel = path.relative(dir, full).split(path.sep).join("/");
        out[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      }
    }
  };
  walk(dir);
  return out;
}

const snap = snapshot(home);
process.stdout.write(`sandbox ready at ${root}\n`);
if (!symlinkOk) process.stdout.write("symlink: SKIPPED (no permission)\n");
process.stdout.write(`---SNAPSHOT---\n${JSON.stringify(snap)}\n`);
