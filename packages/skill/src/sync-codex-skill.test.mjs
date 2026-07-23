import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  CODEX_SKILL_FILES,
  inspectCodexSkill,
  synchronizeCodexSkill,
} from "../../../scripts/sync-codex-skill.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sourceDir = path.join(repoRoot, ".codex", "skills", "roughdraft");
const tempDirs = [];

function createDestination() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "roughdraft-codex-skill-"),
  );
  tempDirs.push(directory);
  return path.join(directory, "roughdraft");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("repository-owned Codex skill", () => {
  it("synchronizes only the declared files and then passes drift detection", () => {
    const destinationDir = createDestination();

    const result = synchronizeCodexSkill({ sourceDir, destinationDir });

    assert.equal(result.before.matches, false);
    assert.equal(result.after.matches, true);
    assert.equal(result.after.sourceHash, result.after.destinationHash);
    assert.deepEqual(
      CODEX_SKILL_FILES.map((relativePath) =>
        fs.existsSync(path.join(destinationDir, relativePath)),
      ),
      [true, true, true],
    );
  });

  it("reports changed content without writing the destination", () => {
    const destinationDir = createDestination();
    synchronizeCodexSkill({ sourceDir, destinationDir });
    const skillFile = path.join(destinationDir, "SKILL.md");
    fs.appendFileSync(skillFile, "\nDrift fixture.\n");
    const beforeCheck = fs.readFileSync(skillFile, "utf8");

    const result = inspectCodexSkill({ sourceDir, destinationDir });

    assert.equal(result.matches, false);
    assert.deepEqual(result.changedFiles, ["SKILL.md"]);
    assert.equal(fs.readFileSync(skillFile, "utf8"), beforeCheck);
  });

  it("refuses to synchronize across unknown destination files", () => {
    const destinationDir = createDestination();
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.writeFileSync(path.join(destinationDir, "unrelated.md"), "keep me");

    assert.throws(
      () => synchronizeCodexSkill({ sourceDir, destinationDir }),
      /unknown extra files: unrelated\.md/,
    );
    assert.equal(
      fs.readFileSync(path.join(destinationDir, "unrelated.md"), "utf8"),
      "keep me",
    );
  });

  it("refuses to overwrite instructions for another named skill", () => {
    const destinationDir = createDestination();
    fs.mkdirSync(destinationDir, { recursive: true });
    fs.writeFileSync(
      path.join(destinationDir, "SKILL.md"),
      "---\nname: another-skill\ndescription: Fixture.\n---\n",
    );

    assert.throws(
      () => synchronizeCodexSkill({ sourceDir, destinationDir }),
      /unrelated destination instructions/,
    );
  });

  it("declares the watched and nonblocking Codex Desktop flows", () => {
    const skill = fs.readFileSync(path.join(sourceDir, "SKILL.md"), "utf8");

    assert.match(skill, /roughdraft-dev-\$worktree_name/);
    assert.match(skill, /open "\/absolute\/path\/to\/file\.md" --print-url/);
    assert.match(skill, /watch "\/absolute\/path\/to\/file\.md" --json/);
    assert.match(skill, /Before navigating, start a fresh watcher/);
    assert.match(skill, /browser:control-in-app-browser/);
    assert.match(skill, /re-read\s+the Markdown file from disk/i);
    assert.match(skill, /without starting a watcher/);
    assert.match(skill, /doctor/);
  });
});
