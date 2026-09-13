import { test } from "node:test";
import assert from "node:assert/strict";
import { gitRepoName, isSafeSkillName, resolveSkillName } from "../skills/skill-name";

test("gitRepoName handles the URL shapes git accepts", () => {
  assert.equal(gitRepoName("https://github.com/user/my-skill"), "my-skill");
  assert.equal(gitRepoName("https://github.com/user/my-skill.git"), "my-skill");
  assert.equal(gitRepoName("https://github.com/user/my-skill/"), "my-skill");
  assert.equal(gitRepoName("git@github.com:user/my-skill.git"), "my-skill");
  assert.equal(gitRepoName("ssh://git@host:2222/team/my-skill.git"), "my-skill");
  assert.equal(gitRepoName("my-skill.git"), "my-skill");
  assert.equal(gitRepoName(""), null);
});

test("gitRepoName handles local Windows paths, which git also accepts", () => {
  assert.equal(gitRepoName("C:\\repos\\my-skill.git"), "my-skill");
  assert.equal(gitRepoName("C:\\repos\\my-skill"), "my-skill");
  assert.equal(gitRepoName("C:\\repos\\my-skill\\"), "my-skill");
  assert.equal(gitRepoName("\\\\server\\share\\my-skill.git"), "my-skill");
});

test("isSafeSkillName only accepts a plain folder name", () => {
  assert.equal(isSafeSkillName("my-skill"), true);
  assert.equal(isSafeSkillName("skill_v2"), true);
  for (const bad of ["", ".", "..", "a/b", "a\\b", "../escape", "nested/name"]) {
    assert.equal(isSafeSkillName(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test("an explicit --name wins over everything", () => {
  assert.equal(
    resolveSkillName({
      explicit: "chosen",
      dirName: "folder",
      declaredName: "declared",
      repoName: "repo",
      dirNameIsMeaningful: true,
    }),
    "chosen"
  );
});

test("a meaningful folder name is the default identity", () => {
  assert.equal(
    resolveSkillName({
      dirName: "folder",
      declaredName: "declared",
      repoName: "repo",
      dirNameIsMeaningful: true,
    }),
    "folder"
  );
});

test("falls back to the declaration when the folder is the temp clone", () => {
  assert.equal(
    resolveSkillName({
      dirName: "acm-skill-a1b2c3",
      declaredName: "declared",
      repoName: "repo",
      dirNameIsMeaningful: false,
    }),
    "declared"
  );
});

test("falls back to the repository name when nothing is declared", () => {
  assert.equal(
    resolveSkillName({
      dirName: "acm-skill-a1b2c3",
      declaredName: null,
      repoName: "repo",
      dirNameIsMeaningful: false,
    }),
    "repo"
  );
});

test("last resort is the folder name even when meaningless", () => {
  assert.equal(
    resolveSkillName({
      dirName: "acm-skill-a1b2c3",
      declaredName: null,
      repoName: null,
      dirNameIsMeaningful: false,
    }),
    "acm-skill-a1b2c3"
  );
});
