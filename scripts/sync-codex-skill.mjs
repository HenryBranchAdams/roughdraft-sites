#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CODEX_SKILL_FILES = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/sites-hosting-options.md",
];

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultSourceDir = path.join(repoRoot, ".codex", "skills", "roughdraft");
const defaultDestinationDir = path.join(
  os.homedir(),
  ".codex",
  "skills",
  "roughdraft",
);

function appendSlog(event, data = {}) {
  const file = process.env.THOUGHTFUL_SLOG_FILE;
  if (!file) return;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(
    file,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      runId: process.env.THOUGHTFUL_SLOG_RUN_ID ?? "manual",
      source: "scripts/sync-codex-skill.mjs",
      event,
      data,
    })}\n`,
  );
}

function walkFiles(rootDir, relativeDir = "") {
  if (!fs.existsSync(rootDir)) return [];

  const currentDir = path.join(rootDir, relativeDir);
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDir, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symbolic link in skill tree: ${relativePath}`);
    }

    if (entry.isDirectory()) {
      files.push(...walkFiles(rootDir, relativePath));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported skill tree entry: ${relativePath}`);
    }

    files.push(relativePath);
  }

  return files.sort();
}

function readDeclaredFiles(rootDir) {
  return new Map(
    CODEX_SKILL_FILES.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(rootDir, relativePath)),
    ]),
  );
}

function hashFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const [relativePath, content] of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function assertSourceInventory(sourceDir) {
  const actualFiles = walkFiles(sourceDir);
  const missingFiles = CODEX_SKILL_FILES.filter(
    (relativePath) => !actualFiles.includes(relativePath),
  );
  const extraFiles = actualFiles.filter(
    (relativePath) => !CODEX_SKILL_FILES.includes(relativePath),
  );

  if (missingFiles.length > 0 || extraFiles.length > 0) {
    throw new Error(
      `Repository skill inventory does not match the declared files. Missing: ${
        missingFiles.join(", ") || "none"
      }. Extra: ${extraFiles.join(", ") || "none"}.`,
    );
  }
}

function readSkillName(skillFile) {
  const content = fs.readFileSync(skillFile, "utf8");
  const match = content.match(
    /^---\n[\s\S]*?\nname:\s*([^\n]+)\n[\s\S]*?\n---/,
  );
  return match?.[1]?.trim() ?? null;
}

function assertDestinationSafe(destinationDir) {
  const resolved = path.resolve(destinationDir);
  if (resolved === path.parse(resolved).root || resolved === os.homedir()) {
    throw new Error(`Refusing unsafe destination: ${resolved}`);
  }

  if (!fs.existsSync(resolved)) return;
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Destination must be a real directory: ${resolved}`);
  }

  const extraFiles = walkFiles(resolved).filter(
    (relativePath) => !CODEX_SKILL_FILES.includes(relativePath),
  );
  if (extraFiles.length > 0) {
    throw new Error(
      `Refusing destination with unknown extra files: ${extraFiles.join(", ")}`,
    );
  }

  const skillFile = path.join(resolved, "SKILL.md");
  if (fs.existsSync(skillFile)) {
    const name = readSkillName(skillFile);
    if (name !== "roughdraft") {
      throw new Error(
        `Refusing unrelated destination instructions (skill name: ${
          name ?? "missing"
        }).`,
      );
    }
  }
}

export function inspectCodexSkill({
  sourceDir = defaultSourceDir,
  destinationDir = defaultDestinationDir,
} = {}) {
  const resolvedSource = path.resolve(sourceDir);
  const resolvedDestination = path.resolve(destinationDir);
  assertSourceInventory(resolvedSource);

  const sourceFiles = readDeclaredFiles(resolvedSource);
  const sourceHash = hashFiles(sourceFiles);
  const destinationExists = fs.existsSync(resolvedDestination);
  const destinationInventory = destinationExists
    ? walkFiles(resolvedDestination)
    : [];
  const missingFiles = CODEX_SKILL_FILES.filter(
    (relativePath) => !destinationInventory.includes(relativePath),
  );
  const extraFiles = destinationInventory.filter(
    (relativePath) => !CODEX_SKILL_FILES.includes(relativePath),
  );
  const changedFiles = [];

  for (const relativePath of CODEX_SKILL_FILES) {
    if (missingFiles.includes(relativePath)) continue;
    const source = sourceFiles.get(relativePath);
    const destination = fs.readFileSync(
      path.join(resolvedDestination, relativePath),
    );
    if (!source.equals(destination)) changedFiles.push(relativePath);
  }

  const destinationHash =
    destinationExists && missingFiles.length === 0 && extraFiles.length === 0
      ? hashFiles(readDeclaredFiles(resolvedDestination))
      : null;
  const matches =
    extraFiles.length === 0 &&
    missingFiles.length === 0 &&
    changedFiles.length === 0 &&
    destinationHash === sourceHash;

  appendSlog("codex-skill.inspected", {
    changedCount: changedFiles.length,
    destinationExists,
    extraCount: extraFiles.length,
    matches,
    missingCount: missingFiles.length,
    sourceHash,
    destinationHash,
  });

  return {
    sourceDir: resolvedSource,
    destinationDir: resolvedDestination,
    sourceHash,
    destinationHash,
    destinationExists,
    matches,
    missingFiles,
    extraFiles,
    changedFiles,
  };
}

export function synchronizeCodexSkill({
  sourceDir = defaultSourceDir,
  destinationDir = defaultDestinationDir,
} = {}) {
  const resolvedSource = path.resolve(sourceDir);
  const resolvedDestination = path.resolve(destinationDir);
  assertSourceInventory(resolvedSource);
  assertDestinationSafe(resolvedDestination);
  const before = inspectCodexSkill({
    sourceDir: resolvedSource,
    destinationDir: resolvedDestination,
  });

  fs.mkdirSync(resolvedDestination, { recursive: true });
  for (const relativePath of CODEX_SKILL_FILES) {
    const source = path.join(resolvedSource, relativePath);
    const destination = path.join(resolvedDestination, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}`;
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, destination);
  }

  const after = inspectCodexSkill({
    sourceDir: resolvedSource,
    destinationDir: resolvedDestination,
  });
  if (!after.matches) {
    throw new Error("Skill synchronization did not produce a matching tree.");
  }

  appendSlog("codex-skill.synchronized", {
    previousHash: before.destinationHash,
    sourceHash: after.sourceHash,
  });
  return { before, after };
}

function parseArgs(argv) {
  let mode = null;
  let destinationDir = defaultDestinationDir;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check" || arg === "--install") {
      if (mode) throw new Error("Use exactly one of --check or --install.");
      mode = arg.slice(2);
      continue;
    }
    if (arg === "--destination") {
      const value = argv[index + 1];
      if (!value) throw new Error("--destination requires a path.");
      destinationDir = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") return { help: true };
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!mode) throw new Error("Use exactly one of --check or --install.");
  return { help: false, mode, destinationDir };
}

function printHelp(log = console.log) {
  log("Check or deliberately synchronize the repository-owned Codex skill.");
  log("");
  log("Usage:");
  log("  pnpm codex-skill:check");
  log("  pnpm codex-skill:install");
  log("  node scripts/sync-codex-skill.mjs --check --destination <path>");
  log("  node scripts/sync-codex-skill.mjs --install --destination <path>");
  log("");
  log("The install path is never run automatically.");
}

function printInspection(result, log = console.log) {
  log(`Source: ${result.sourceDir}`);
  log(`Source SHA-256: ${result.sourceHash}`);
  log(`Destination: ${result.destinationDir}`);
  log(`Destination SHA-256: ${result.destinationHash ?? "unavailable"}`);
  log(`Status: ${result.matches ? "in sync" : "drift detected"}`);
  if (result.missingFiles.length > 0) {
    log(`Missing: ${result.missingFiles.join(", ")}`);
  }
  if (result.extraFiles.length > 0) {
    log(`Extra: ${result.extraFiles.join(", ")}`);
  }
  if (result.changedFiles.length > 0) {
    log(`Changed: ${result.changedFiles.join(", ")}`);
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }

    if (args.mode === "check") {
      const result = inspectCodexSkill({
        destinationDir: args.destinationDir,
      });
      printInspection(result);
      process.exit(result.matches ? 0 : 1);
    }

    const result = synchronizeCodexSkill({
      destinationDir: args.destinationDir,
    });
    printInspection(result.after);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Codex skill operation failed.",
    );
    process.exit(1);
  }
}
