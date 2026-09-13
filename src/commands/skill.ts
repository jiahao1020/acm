import { Command } from "commander";
import chalk from "chalk";
import * as prompts from "@clack/prompts";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { getSelectedSkillAdapters } from "../skills/registry";
import { SkillAdapter } from "../skills/skill-adapter";
import { gitRepoName, isSafeSkillName, resolveSkillName } from "../skills/skill-name";
import { listSkillDirs, isSkillDir } from "../utils/fs-copy";
import { digestSkillDir } from "../utils/skill-digest";
import { selectClientIds, unknownClientMessage } from "../utils/targets";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolve the `--client` option against detected clients.
 * Returns null (after reporting) when an id matches nothing, so callers can
 * bail out instead of acting on a silently narrowed list.
 */
function resolveTargets(clientOpt?: string): SkillAdapter[] | null {
  const available = getSelectedSkillAdapters();
  const { targets, unknown } = selectClientIds(available, clientOpt);
  if (unknown.length > 0) {
    prompts.log.error(unknownClientMessage(unknown, available));
    process.exitCode = 1;
    return null;
  }
  return targets;
}

/** Build skill name → set of client ids that have it. */
function buildMatrix(clients: SkillAdapter[]): Map<string, Set<string>> {
  const matrix = new Map<string, Set<string>>();
  for (const client of clients) {
    for (const name of client.listSkills()) {
      if (!matrix.has(name)) matrix.set(name, new Set());
      matrix.get(name)!.add(client.id);
    }
  }
  return matrix;
}

/**
 * Skills that exist in more than one client but do not hold the same content.
 *
 * Name-level comparison cannot see these: a skill updated in one client keeps
 * every diff looking clean while the others silently run the old version.
 */
interface SkillDrift {
  name: string;
  /** One entry per distinct content, listing the client ids holding it. */
  variants: { digest: string; ids: string[] }[];
}

/** One skill to copy into a set of clients, from a named source client. */
interface SyncStep {
  name: string;
  from: SkillAdapter;
  to: SkillAdapter[];
}

function computeDrift(
  clients: SkillAdapter[],
  matrix: Map<string, Set<string>>
): SkillDrift[] {
  const drifted: SkillDrift[] = [];

  for (const [name, present] of matrix) {
    const holders = clients.filter((c) => present.has(c.id));
    if (holders.length < 2) continue; // nothing to disagree with

    const byDigest = new Map<string, string[]>();
    for (const client of holders) {
      const dir = client.findSkill(name);
      if (!dir) continue;
      const digest = digestSkillDir(dir);
      if (!byDigest.has(digest)) byDigest.set(digest, []);
      byDigest.get(digest)!.push(client.id);
    }

    if (byDigest.size > 1) {
      drifted.push({
        name,
        variants: [...byDigest].map(([digest, ids]) => ({ digest, ids })),
      });
    }
  }

  return drifted;
}

/** Read `name:` from a SKILL.md YAML frontmatter block, if present. */
function readSkillName(skillDir: string): string | null {
  try {
    const text = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
    const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return null;
    const nm = m[1].match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
    return nm ? nm[1].trim() : null;
  } catch {
    return null;
  }
}

/** Locate the skill folder inside a cloned repo. */
function locateSkillInRepo(repoDir: string, wantName?: string): string | null {
  if (isSkillDir(repoDir)) return repoDir;

  // Common layouts: <repo>/skills/<name>, or the skill folder itself
  const candidates = [
    path.join(repoDir, "skills"),
    path.join(repoDir, ".claude", "skills"),
  ];
  for (const root of candidates) {
    const names = listSkillDirs(root);
    if (names.length === 0) continue;
    if (wantName && names.includes(wantName)) return path.join(root, wantName);
    if (names.length === 1) return path.join(root, names[0]);
    if (wantName === undefined) {
      // Ambiguous: report via error by returning null with detail
      throw new Error(
        `repo contains multiple skills (${names.slice(0, 5).join(", ")}${
          names.length > 5 ? ", …" : ""
        }); specify one with --name <skill>`
      );
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  acm skill list                                                    */
/* ------------------------------------------------------------------ */

async function skillList(opts: { all?: boolean }): Promise<void> {
  const clients = getSelectedSkillAdapters();
  if (clients.length === 0) {
    prompts.log.warn("No clients detected. Run `acm init` first.");
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold("\nSkill roots:\n"));
  for (const client of clients) {
    const names = client.listSkills();
    // Show the root that actually holds skills (ZCode has two)
    const dirs = client.getSkillsDirs();
    const active = dirs.find((d) => fs.existsSync(d)) ?? dirs[0];
    const tag = client.isCatalog?.() ? chalk.dim(" [catalog]") : "";
    console.log(
      `  ${client.displayName.padEnd(14)} ${chalk.bold(String(names.length).padStart(3))} skills  ${chalk.dim(active)}${tag}`
    );
  }

  // Catalogs (e.g. a 295-entry marketplace) are excluded from the diff by
  // default, otherwise every other client looks like it is missing hundreds.
  const compareClients = opts.all
    ? clients
    : clients.filter((c) => !c.isCatalog?.());

  const matrix = buildMatrix(compareClients);
  if (matrix.size === 0) {
    console.log();
    prompts.log.info("No skills found in any client.");
    return;
  }

  const partial: string[] = [];
  for (const [name, present] of matrix) {
    if (present.size < compareClients.length) partial.push(name);
  }

  const drift = computeDrift(compareClients, matrix);

  if (partial.length === 0 && drift.length === 0) {
    console.log();
    prompts.log.success(
      `All ${matrix.size} skill(s) are present in every compared client with identical content.`
    );
    return;
  }

  if (partial.length > 0) {
    const limit = opts.all ? partial.length : 40;
    const shown = partial.slice(0, limit);

    console.log(
      chalk.bold(`\nSkills missing from at least one client (${partial.length}):\n`)
    );
    for (const name of shown) {
      const present = matrix.get(name)!;
      const missing = compareClients.filter((c) => !present.has(c.id));
      console.log(
        `  ${chalk.yellow(name)}  ${chalk.dim("missing in:")} ${missing
          .map((c) => chalk.red(c.id))
          .join(", ")}`
      );
    }
    if (partial.length > shown.length) {
      console.log(
        chalk.dim(`\n  … and ${partial.length - shown.length} more (use --all to show)`)
      );
    }
  }

  if (drift.length > 0) {
    const driftLimit = opts.all ? drift.length : 10;
    const shownDrift = drift.slice(0, driftLimit);

    console.log(
      chalk.bold(`\nSame name but different content (${drift.length}):\n`)
    );
    for (const d of shownDrift) {
      console.log(`  ${chalk.yellow(d.name)}`);
      d.variants.forEach((variant, index) => {
        console.log(
          `    ${chalk.dim(`version ${index + 1}:`)} ${variant.ids.join(", ")}`
        );
      });
    }
    if (drift.length > shownDrift.length) {
      console.log(
        chalk.dim(`\n  … and ${drift.length - shownDrift.length} more (use --all to show)`)
      );
    }
    console.log();
    prompts.log.info(
      `Run ${chalk.bold("acm skill sync --update")} to replace the older copies with a source client's version.`
    );
  }

  console.log();
}

/* ------------------------------------------------------------------ */
/*  acm skill sync                                                    */
/* ------------------------------------------------------------------ */

async function skillSync(opts: {
  yes?: boolean;
  client?: string;
  from?: string;
  update?: boolean;
}): Promise<void> {
  const all = getSelectedSkillAdapters();
  if (all.length < 2) {
    prompts.log.warn("Need at least 2 detected clients to sync.");
    process.exitCode = 1;
    return;
  }

  const explicitClient = Boolean(opts.client);
  const explicitFrom = Boolean(opts.from);

  const resolved = resolveTargets(opts.client);
  if (!resolved) return;
  const targets = resolved.filter((c) => explicitClient || !c.isCatalog?.());
  const sourceIds = opts.from ? opts.from.split(",").map((s) => s.trim()) : null;
  const sources = (sourceIds ? all.filter((a) => sourceIds.includes(a.id)) : all).filter(
    (c) => explicitFrom || !c.isCatalog?.()
  );

  if (targets.length === 0 || sources.length === 0) {
    prompts.log.warn("No matching clients.");
    process.exitCode = 1;
    return;
  }

  const matrix = buildMatrix(all);
  const missingPlan: SyncStep[] = [];
  const updatePlan: SyncStep[] = [];

  for (const [name, present] of matrix) {
    // Prefer a source client that the user allowed and that has the skill
    const source = sources.find((c) => present.has(c.id));
    if (!source) continue;

    const missing = targets.filter((c) => !present.has(c.id));
    if (missing.length > 0) missingPlan.push({ name, from: source, to: missing });

    if (!opts.update) continue;

    // A target that already has the skill but with different content: the
    // name-level diff cannot see it, so it needs an explicit overwrite.
    const sourceDir = source.findSkill(name);
    if (!sourceDir) continue;
    const sourceDigest = digestSkillDir(sourceDir);
    const stale = targets.filter((c) => {
      if (!present.has(c.id)) return false; // covered by missingPlan
      const dir = c.findSkill(name);
      return dir !== null && digestSkillDir(dir) !== sourceDigest;
    });
    if (stale.length > 0) updatePlan.push({ name, from: source, to: stale });
  }

  if (missingPlan.length === 0 && updatePlan.length === 0) {
    if (!opts.update) {
      // Report drift even when it is not being fixed, so a difference in
      // content is never silently reported as "in sync".
      const drift = computeDrift(targets, buildMatrix(targets));
      if (drift.length > 0) {
        console.log(
          chalk.bold.yellow(
            `\n${drift.length} skill(s) have the same name but different content:\n`
          )
        );
        for (const d of drift.slice(0, 10)) {
          console.log(
            `  ${chalk.yellow(d.name)}  ${d.variants
              .map((v) => chalk.dim(`v${d.variants.indexOf(v) + 1}: ${v.ids.join(", ")}`))
              .join("  ")}`
          );
        }
        if (drift.length > 10) {
          console.log(chalk.dim(`  … and ${drift.length - 10} more`));
        }
        console.log();
        prompts.log.info(
          `Re-run with ${chalk.bold("--update")} to replace the older copies.`
        );
        process.exitCode = 1;
        return;
      }
    }
    prompts.log.success("All skills are already in sync for the selected clients.");
    return;
  }

  /** Print a plan and return how many client copies it covers. */
  const printPlan = (title: string, steps: SyncStep[]): number => {
    const copies = steps.reduce((n, s) => n + s.to.length, 0);
    console.log(
      chalk.bold(`\n${title} — ${steps.length} skill(s), ${copies} client(s):\n`)
    );

    const limit = 25;
    for (const step of steps.slice(0, limit)) {
      console.log(
        `  ${chalk.yellow(step.name)}  ${chalk.dim(`from ${step.from.id}`)} ${chalk.dim("→")} ${step.to
          .map((c) => c.id)
          .join(", ")}`
      );
    }
    if (steps.length > limit) {
      console.log(chalk.dim(`  … and ${steps.length - limit} more`));
    }
    return copies;
  };

  let total = 0;
  if (missingPlan.length > 0) total += printPlan("Skills to copy", missingPlan);
  if (updatePlan.length > 0) {
    console.log(
      chalk.bold.yellow("\nUpdating replaces the existing skill folder in those clients.")
    );
    total += printPlan("Skills to update (same name, different content)", updatePlan);
  }
  console.log();

  if (!opts.yes) {
    const go = await prompts.confirm({
      message: `Apply ${total} skill change(s)?`,
      initialValue: false,
    });
    if (prompts.isCancel(go) || !go) {
      prompts.log.info("Sync cancelled.");
      return;
    }
  }

  let ok = 0;
  let fail = 0;
  const run = (steps: SyncStep[], force: boolean): void => {
    for (const step of steps) {
      const srcDir = step.from.findSkill(step.name);
      if (!srcDir) continue;
      for (const target of step.to) {
        try {
          target.installSkill(step.name, srcDir, force);
          console.log(`  ${chalk.green("✓")} ${step.name} → ${target.displayName}`);
          ok++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(
            `  ${chalk.red("✗")} ${step.name} → ${target.displayName}  ${chalk.dim(msg)}`
          );
          fail++;
        }
      }
    }
  };

  run(missingPlan, false);
  run(updatePlan, true);

  console.log();
  prompts.log.success(`Synced ${ok} skill copy(ies)${fail ? `, ${fail} failed` : ""}.`);
  if (fail > 0) process.exitCode = 1;
}

/* ------------------------------------------------------------------ */
/*  acm skill install                                                 */
/* ------------------------------------------------------------------ */

async function skillInstall(
  source: string,
  opts: { name?: string; client?: string; force?: boolean }
): Promise<void> {
  const targets = resolveTargets(opts.client);
  if (!targets) return;
  if (targets.length === 0) {
    prompts.log.warn("No detected clients to install into.");
    process.exitCode = 1;
    return;
  }

  let srcDir: string | null = null;
  let tempDir: string | null = null;
  let repoName: string | null = null;

  const looksLikeGit =
    /^(https?:\/\/|git@|ssh:\/\/)/.test(source) || source.endsWith(".git");

  if (looksLikeGit) {
    // Needed only if the repository root itself is the skill: the clone lands in
    // a throwaway directory whose name says nothing about the skill.
    repoName = gitRepoName(source);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "acm-skill-"));
    const spinner = prompts.spinner();
    spinner.start(`Cloning ${source}`);
    try {
      execFileSync("git", ["clone", "--depth", "1", source, tempDir], {
        stdio: "pipe",
      });
      spinner.stop("Cloned.");
    } catch (err: unknown) {
      spinner.stop("Clone failed.");
      const msg = err instanceof Error ? err.message : String(err);
      prompts.log.error(msg);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return;
    }

    try {
      srcDir = locateSkillInRepo(tempDir, opts.name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      prompts.log.error(msg);
      fs.rmSync(tempDir, { recursive: true, force: true });
      return;
    }

    if (!srcDir) {
      prompts.log.error("No SKILL.md found in the repository.");
      fs.rmSync(tempDir, { recursive: true, force: true });
      return;
    }
  } else {
    const abs = path.resolve(source);
    if (!fs.existsSync(abs)) {
      prompts.log.error(`Source not found: ${abs}`);
      process.exitCode = 1;
      return;
    }
    if (isSkillDir(abs)) {
      srcDir = abs;
    } else {
      // Either a directory of skills, or a repo-style dir with a nested
      // skills/ (or .claude/skills/) folder holding them.
      let root = abs;
      let names = listSkillDirs(root);
      if (names.length === 0) {
        for (const sub of ["skills", path.join(".claude", "skills")]) {
          const candidate = path.join(abs, sub);
          const found = listSkillDirs(candidate);
          if (found.length > 0) {
            root = candidate;
            names = found;
            break;
          }
        }
      }

      if (names.length === 0) {
        prompts.log.error(`No SKILL.md found in ${abs}`);
        process.exitCode = 1;
        return;
      }
      if (opts.name && names.includes(opts.name)) {
        srcDir = path.join(root, opts.name);
      } else if (opts.name) {
        prompts.log.error(
          `Skill "${opts.name}" not found. Available: ${names.slice(0, 8).join(", ")}`
        );
        return;
      } else if (names.length === 1) {
        srcDir = path.join(root, names[0]);
      } else {
        prompts.log.error(
          `Directory contains ${names.length} skills; pick one with --name (e.g. ${names[0]})`
        );
        return;
      }
    }
  }

  // The folder name is the skill's identity in list/sync/remove and in the
  // clients' own discovery, so it is the default name. It is only meaningless
  // when the folder is the temp clone we just made.
  const declaredName = readSkillName(srcDir);
  const skillName = resolveSkillName({
    explicit: opts.name,
    dirName: path.basename(srcDir),
    declaredName,
    repoName,
    dirNameIsMeaningful: tempDir === null || srcDir !== tempDir,
  });

  if (!isSafeSkillName(skillName)) {
    prompts.log.error(
      `Refusing to install as ${JSON.stringify(skillName)}: a skill name must be a single folder name. Pass --name to choose one.`
    );
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // Surface a divergence instead of hiding it: installing under the folder name
  // while SKILL.md declares another name is exactly what makes the same skill
  // look like two different skills to `list` and `sync`.
  if (!opts.name && declaredName && declaredName !== skillName) {
    prompts.log.warn(
      `SKILL.md declares name "${declaredName}" but the folder is "${skillName}"; installing as "${skillName}". Use --name ${declaredName} to follow the declaration.`
    );
  }

  console.log(
    chalk.bold(`\nInstalling ${chalk.cyan(skillName)} into ${targets.length} client(s):\n`)
  );

  let ok = 0;
  for (const client of targets) {
    try {
      client.installSkill(skillName, srcDir, opts.force ?? false);
      console.log(`  ${chalk.green("✓")} ${client.displayName}`);
      ok++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${chalk.red("✗")} ${client.displayName}  ${chalk.dim(msg)}`);
    }
  }

  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

  console.log();
  if (ok > 0) prompts.log.success(`Installed "${skillName}" to ${ok} client(s).`);
  else {
    prompts.log.warn("Nothing installed.");
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------ */
/*  acm skill remove                                                  */
/* ------------------------------------------------------------------ */

async function skillRemove(
  name: string,
  opts: { client?: string; dryRun?: boolean; yes?: boolean }
): Promise<void> {
  const targets = resolveTargets(opts.client);
  if (!targets) return;
  const present = targets.filter((c) => c.findSkill(name) !== null);

  if (present.length === 0) {
    prompts.log.warn(`Skill "${name}" not found in any client.`);
    process.exitCode = 1;
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.bold(`\nWould remove "${name}" from:\n`));
    for (const client of present) {
      console.log(`  ${chalk.dim("·")} ${client.displayName}  ${chalk.dim(client.findSkill(name) ?? "")}`);
    }
    console.log();
    return;
  }

  if (!opts.yes) {
    const go = await prompts.confirm({
      message: `Delete "${name}" from ${present.length} client(s)?`,
      initialValue: false,
    });
    if (prompts.isCancel(go) || !go) {
      prompts.log.info("Cancelled.");
      return;
    }
  }

  let ok = 0;
  for (const client of targets) {
    if (client.removeSkill(name)) {
      console.log(`  ${chalk.green("✓")} ${client.displayName}  removed`);
      ok++;
    }
  }

  console.log();
  if (ok > 0) prompts.log.success(`Removed "${name}" from ${ok} client(s).`);
}

/* ------------------------------------------------------------------ */
/*  Command registration                                              */
/* ------------------------------------------------------------------ */

export function createSkillCommand(): Command {
  const skill = new Command("skill").description(
    "Manage Agent Skills (SKILL.md) across clients"
  );

  skill
    .command("list")
    .description("Show skill counts and cross-client differences")
    .option("--all", "Show every differing skill, not just the first 40")
    .action(async (opts) => {
      await skillList(opts);
    });

  skill
    .command("sync")
    .description("Copy skills to clients that lack them")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--client <ids>", "Target clients to copy INTO (comma-separated)")
    .option("--from <ids>", "Only use these clients as sources")
    .option(
      "--update",
      "Also overwrite copies whose content differs from the source client"
    )
    .action(async (opts) => {
      await skillSync(opts);
    });

  skill
    .command("install")
    .description("Install a skill from a local directory or git repo")
    .argument("<source>", "Local path or git URL")
    .option("--name <name>", "Skill name (defaults to SKILL.md name or folder name)")
    .option("--client <ids>", "Target clients (comma-separated)")
    .option("--force", "Overwrite an existing skill of the same name")
    .action(async (source, opts) => {
      await skillInstall(source, opts);
    });

  skill
    .command("remove")
    .description("Delete a skill from clients")
    .argument("<name>", "Skill name")
    .option("--client <ids>", "Target clients (comma-separated)")
    .option("--dry-run", "Show what would be deleted")
    .option("-y, --yes", "Skip the confirmation prompt")
    .action(async (name, opts) => {
      await skillRemove(name, opts);
    });

  return skill;
}
