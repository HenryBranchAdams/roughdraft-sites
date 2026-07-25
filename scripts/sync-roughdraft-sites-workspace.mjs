import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REQUIRED_HOSTING = {
  project_id: "appgprj_6a626f45451c81918d340d488500c0b6",
  d1: "DB",
  r2: "FILES",
};
const SOURCE = resolve(
  new URL("../sites/roughdraft-collaboration", import.meta.url).pathname,
);
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const workspaceIndex = args.indexOf("--workspace");
const workspace =
  workspaceIndex >= 0 ? resolve(args[workspaceIndex + 1] ?? "") : null;

if (!workspace) {
  console.error(
    "Pass --workspace <existing Sites delivery workspace>. No default path is embedded.",
  );
  process.exit(2);
}

const hostingPath = join(workspace, ".openai", "hosting.json");
const hosting = JSON.parse(await readFile(hostingPath, "utf8"));
for (const [key, expected] of Object.entries(REQUIRED_HOSTING)) {
  if (hosting[key] !== expected) {
    throw new Error(
      `Refusing to sync: .openai/hosting.json ${key} must remain ${expected}.`,
    );
  }
}

const excluded = new Set([
  ".git",
  ".openai",
  ".next",
  ".vinext",
  ".wrangler",
  "dist",
  "node_modules",
  "outputs",
  "work",
]);
const sourceFiles = await listFiles(SOURCE);
const sourceHash = await hashFiles(SOURCE, sourceFiles);
const receiptPath = join(workspace, ".fork-source.json");
const receipt = {
  format: 1,
  repository: "HenryBranchAdams/roughdraft-sites",
  sourceDirectory: "sites/roughdraft-collaboration",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: resolve(SOURCE, "../.."),
    encoding: "utf8",
  }).trim(),
  sourceHash,
  projectId: REQUIRED_HOSTING.project_id,
  bindings: { d1: REQUIRED_HOSTING.d1, r2: REQUIRED_HOSTING.r2 },
  files: sourceFiles,
};

const mismatches = [];
for (const file of sourceFiles) {
  const target = join(workspace, file);
  try {
    const [sourceBytes, targetBytes] = await Promise.all([
      readFile(join(SOURCE, file)),
      readFile(target),
    ]);
    if (!sourceBytes.equals(targetBytes)) mismatches.push(file);
  } catch {
    mismatches.push(file);
  }
}

let previousFiles = [];
try {
  previousFiles = JSON.parse(await readFile(receiptPath, "utf8")).files ?? [];
} catch {
  // A baseline delivery workspace has no fork receipt yet.
}
const removed = previousFiles.filter((file) => !sourceFiles.includes(file));

if (checkOnly) {
  let receiptMatches = false;
  try {
    const existing = JSON.parse(await readFile(receiptPath, "utf8"));
    receiptMatches =
      existing.sourceHash === sourceHash &&
      existing.sourceCommit === receipt.sourceCommit &&
      existing.projectId === receipt.projectId &&
      existing.bindings?.d1 === receipt.bindings.d1 &&
      existing.bindings?.r2 === receipt.bindings.r2;
  } catch {
    receiptMatches = false;
  }
  if (mismatches.length || removed.length || !receiptMatches) {
    console.error(
      JSON.stringify(
        { status: "drift", mismatches, removed, receiptMatches },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify(
        {
          status: "in-sync",
          sourceCommit: receipt.sourceCommit,
          sourceHash,
          files: sourceFiles.length,
          projectId: receipt.projectId,
          bindings: receipt.bindings,
        },
        null,
        2,
      ),
    );
  }
  process.exit();
}

for (const file of sourceFiles) {
  const target = join(workspace, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(SOURCE, file), target);
}
for (const file of removed) {
  await rm(join(workspace, file), { force: true });
}
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      status: "synchronized",
      sourceCommit: receipt.sourceCommit,
      sourceHash,
      files: sourceFiles.length,
      projectId: receipt.projectId,
      bindings: receipt.bindings,
    },
    null,
    2,
  ),
);

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else if (entry.isFile() && entry.name !== ".fork-source.json") {
      files.push(relative(root, path));
    }
  }
  return files.sort();
}

async function hashFiles(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const info = await stat(join(root, file));
    hash.update(`${file}\0${info.size}\0`);
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
