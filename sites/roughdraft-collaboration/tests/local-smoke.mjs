import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = process.env.ROUGHDRAFT_ORIGIN ?? "http://localhost:3000";
const auditEmail = `audit-only-${crypto.randomUUID()}@example.test`;

function withAuth(init = {}) {
  const headers = new Headers(init.headers);
  headers.set("oai-authenticated-user-email", auditEmail);
  return { ...init, headers };
}

async function json(path, init) {
  const response = await fetch(`${origin}${path}`, withAuth(init));
  const body = await response.json();
  return { response, body };
}

const status = await json("/api/status");
assert.equal(status.response.status, 200);
assert.equal(status.body.backend, "sites-hosted");
assert.equal(status.body.kind, "sites-hosted");
assert.equal(status.body.canonical, "hosted-record");
assert.equal(status.body.capabilities.sharedDocuments, true);
assert.equal(status.body.capabilities.optimisticConcurrency, true);
assert.equal(status.body.capabilities.reviewEvents, true);
assert.equal(status.body.capabilities.assets, true);
assert.equal(status.body.capabilities.localFileSync, false);

const initial = await json("/api/document");
assert.equal(initial.response.status, 200);
assert.match(initial.body.document.version, /^d1:\d+$/);
assert.deepEqual(initial.body.viewer, { displayName: "Site member" });
assert.equal("title" in initial.body.document, false);
assert.equal("updatedBy" in initial.body.document, false);
assert.equal(
  JSON.stringify(initial.body),
  JSON.stringify(initial.body).replaceAll(auditEmail, ""),
);

const manifest = await json("/api/documents");
assert.equal(manifest.response.status, 200);
assert.ok(
  manifest.body.documents.some(
    (document) => document.id === initial.body.document.id,
  ),
);

const importedPath = `smoke/${crypto.randomUUID()}.md`;
const created = await json("/api/documents", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: importedPath,
    content: "# Isolated hosted document\n",
    operation: "import",
  }),
});
assert.equal(created.response.status, 201);
assert.notEqual(created.body.document.id, initial.body.document.id);
assert.equal(created.body.document.path, importedPath);

const scopedDocument = encodeURIComponent(created.body.document.id);
const scopedSaved = await json(`/api/document?document=${scopedDocument}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: "# Isolated hosted document\n\nScoped edit.\n",
    expectedVersion: created.body.document.version,
    changeKind: "edit",
  }),
});
assert.equal(scopedSaved.response.status, 200);
const canonicalAfterScopedSave = await json("/api/document");
assert.equal(
  canonicalAfterScopedSave.body.document.version,
  initial.body.document.version,
  "saving one document must not mutate the default canonical document",
);

const exported = await fetch(
  `${origin}/api/document/export`,
  withAuth({ headers: { Accept: "text/markdown" } }),
);
assert.equal(exported.status, 200);
assert.equal(
  await exported.text(),
  initial.body.document.content,
  "export must reflect the hosted canonical document",
);

const marker = `\n\nHosted smoke ${crypto.randomUUID()}.\n`;
const saved = await json("/api/document", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: initial.body.document.content + marker,
    expectedVersion: initial.body.document.version,
    changeKind: "edit",
  }),
});
assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
assert.notEqual(saved.body.document.version, initial.body.document.version);
assert.ok(saved.body.document.content.endsWith(marker));

const stale = await json("/api/document", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: initial.body.document.content,
    expectedVersion: initial.body.document.version,
    changeKind: "edit",
  }),
});
assert.equal(stale.response.status, 409);
assert.equal(stale.body.current.version, saved.body.document.version);

const reviewed = await json("/api/review-events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    expectedVersion: saved.body.document.version,
    overallComment: "Hosted review delivery smoke test.",
  }),
});
assert.equal(reviewed.response.status, 201);
assert.equal(reviewed.body.delivered, true);
assert.equal(reviewed.body.document.reviewState, "reviewed");
assert.notEqual(reviewed.body.document.version, saved.body.document.version);
assert.match(
  reviewed.body.document.content,
  /Hosted review delivery smoke test/,
);
assert.doesNotMatch(
  reviewed.body.document.content,
  new RegExp(auditEmail, "i"),
);

const activity = await json("/api/history");
assert.equal(activity.response.status, 200);
assert.ok(activity.body.versions.length >= 3);
assert.ok(activity.body.reviews.length >= 1);
assert.equal(
  activity.body.reviews[0].overallComment,
  "Hosted review delivery smoke test.",
);
assert.equal(activity.body.reviews[0].reviewerName, "Site member");
assert.doesNotMatch(JSON.stringify(activity.body), new RegExp(auditEmail, "i"));
assert.equal(
  activity.body.versions.some((version) => "authorEmail" in version),
  false,
);
assert.equal(
  activity.body.reviews.some((review) => "reviewerEmail" in review),
  false,
);

const reviewedExport = await fetch(
  `${origin}/api/document/export`,
  withAuth({ headers: { Accept: "text/markdown" } }),
);
assert.equal(reviewedExport.status, 200);
const reviewedMarkdown = await reviewedExport.text();
assert.match(reviewedMarkdown, /Hosted review delivery smoke test/);
assert.doesNotMatch(reviewedMarkdown, new RegExp(auditEmail, "i"));

const fixture = await readFile(new URL("../public/file.svg", import.meta.url));
const uploadBody = new FormData();
uploadBody.append(
  "file",
  new Blob([fixture], { type: "image/svg+xml" }),
  "smoke.svg",
);
const uploaded = await json("/api/assets", {
  method: "POST",
  body: uploadBody,
});
assert.equal(uploaded.response.status, 201);
assert.match(uploaded.body.markdownPath, /^\.\/\.roughdraft-assets\//);

const downloaded = await fetch(
  `${origin}/api/assets?path=${encodeURIComponent(uploaded.body.markdownPath)}`,
  withAuth(),
);
assert.equal(downloaded.status, 200);
assert.deepEqual(
  Buffer.from(await downloaded.arrayBuffer()),
  fixture,
  "R2-backed assets must round-trip",
);

console.log(
  JSON.stringify({
    status: "passed",
    savedVersion: saved.body.document.version,
    reviewedVersion: reviewed.body.document.version,
    versions: activity.body.versions.length,
    reviews: activity.body.reviews.length,
    assetPath: uploaded.body.markdownPath,
    isolatedDocument: created.body.document.id,
  }),
);
