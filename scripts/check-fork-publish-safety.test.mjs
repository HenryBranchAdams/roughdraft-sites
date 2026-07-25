import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const workflow = await readFile(
  new URL("../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("the fork root package is unpublishable and points to the fork", () => {
  assert.equal(packageJson.name, "roughdraft");
  assert.equal(packageJson.private, true);
  assert.equal(
    packageJson.repository?.url,
    "git+https://github.com/HenryBranchAdams/roughdraft-sites.git",
  );
});

test("the inherited workflow cannot publish or create release tags", () => {
  assert.doesNotMatch(workflow, /\bworkflow_dispatch\s*:/);
  assert.doesNotMatch(workflow, /\bid-token:\s*write\b/);
  assert.doesNotMatch(workflow, /\bcontents:\s*write\b/);
  assert.doesNotMatch(workflow, /\bnpm\s+publish\b/);
  assert.doesNotMatch(workflow, /\bgit\s+push\b/);
  assert.match(workflow, /check-fork-publish-safety\.test\.mjs/);
});

test("public documentation identifies the upstream npm lane and fork non-goal", () => {
  assert.match(readme, /official upstream `roughdraft` package/i);
  assert.match(readme, /does not publish the `roughdraft` npm package/i);
  assert.match(readme, /Lex-Inc\/roughdraft/);
  assert.match(readme, /MIT/);
  assert.match(readme, /Nathan Baschez/);
});
