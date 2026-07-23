import { env } from "cloudflare:workers";
import {
  appendRoughdraftDocumentComment,
  extractRoughdraftReviewIndex,
  validateRoughdraftMarkdown,
} from "../app/roughdraft-ui/rfm";
import roughdraftSkill from "../content/roughdraft-skill.md?raw";
import { applySitesMigrations } from "../db/migrations";
import {
  type HostedDocumentPublicDto,
  type HostedViewerPublicDto,
  readHostedViewerIdentity,
  safeHostedDisplayName,
  toHostedDocumentPublicDto,
  toHostedViewerPublicDto,
} from "./hosted-public-data";

export const CANONICAL_DOCUMENT_ID = "roughdraft-skill";
export const CANONICAL_DOCUMENT_PATH = "roughdraft-SKILL.md";
const MAX_MARKDOWN_BYTES = 1_000_000;
const MAX_OVERALL_COMMENT_LENGTH = 4_000;

export type HostedViewer = {
  displayName: string;
  email: string;
};

export type DocumentAccess = "read" | "write";
export type DocumentAccessScope = "site-members" | "restricted" | "owner-only";

export class HostedDocumentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HostedDocumentError";
  }
}

type DocumentRow = {
  id: string;
  title: string;
  markdown: string;
  version: number;
  review_state: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  schema_version: number;
  access_scope: DocumentAccessScope;
};

export type HostedDocument = {
  id: string;
  title: string;
  content: string;
  version: string;
  versionNumber: number;
  reviewState: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  path: string;
  mode: "sites-hosted";
  canonical: "hosted-record";
  schemaVersion: number;
  accessScope: DocumentAccessScope;
  capabilities: {
    sharedPersistence: true;
    optimisticConcurrency: true;
    importExport: true;
    localFileSync: false;
  };
};

export type { HostedDocumentPublicDto, HostedViewerPublicDto };

let schemaReady: Promise<void> | null = null;

export function getViewer(request: Request): HostedViewer | null {
  return readHostedViewerIdentity(request);
}

export function publicHostedViewer(
  viewer: HostedViewer,
): HostedViewerPublicDto {
  return toHostedViewerPublicDto(viewer);
}

export function publicHostedDocument(
  document: HostedDocument,
): HostedDocumentPublicDto {
  return toHostedDocumentPublicDto(document);
}

export function requireViewer(request: Request): HostedViewer {
  const viewer = getViewer(request);
  if (!viewer) {
    throw new Response("Authentication required", { status: 401 });
  }
  return viewer;
}

export function requireSameOriginMutation(request: Request): void {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) {
    throw new HostedDocumentError(
      "A same-origin request is required.",
      403,
      "cross_origin_request_forbidden",
    );
  }
}

export async function getDatabase(): Promise<D1Database> {
  const database = env.DB;
  if (!database) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  schemaReady ??= applySitesMigrations(database).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
  return database;
}

export async function ensureCanonicalDocument(
  viewer: HostedViewer,
): Promise<HostedDocument> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const title = titleFromMarkdown(roughdraftSkill);

  await database.batch([
    database
      .prepare(`
        INSERT OR IGNORE INTO documents (
          id, slug, title, markdown, version, review_state,
          created_at, updated_at, updated_by, schema_version, access_scope
        ) VALUES (?, ?, ?, ?, 1, 'in_review', ?, ?, ?, 2, 'site-members')
      `)
      .bind(
        CANONICAL_DOCUMENT_ID,
        CANONICAL_DOCUMENT_ID,
        title,
        roughdraftSkill,
        now,
        now,
        viewer.email,
      ),
    database
      .prepare(`
        INSERT OR IGNORE INTO document_versions (
          document_id, version, markdown, author_email, author_name,
          change_kind, created_at
        )
        SELECT id, version, markdown, ?, ?, 'seed', ?
        FROM documents
        WHERE id = ? AND version = 1
      `)
      .bind(viewer.email, viewer.displayName, now, CANONICAL_DOCUMENT_ID),
  ]);

  return readCanonicalDocument(database);
}

export function requestedDocumentId(request: Request): string {
  const value =
    new URL(request.url).searchParams.get("document") ?? CANONICAL_DOCUMENT_ID;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new HostedDocumentError(
      "Hosted document was not found.",
      404,
      "document_not_found",
    );
  }
  return value;
}

export async function requireDocumentAccess(
  request: Request,
  access: DocumentAccess,
  options: { initializeCanonical?: boolean } = {},
): Promise<{ viewer: HostedViewer; document: HostedDocument }> {
  const viewer = requireViewer(request);
  const documentId = requestedDocumentId(request);
  const database = await getDatabase();

  if (options.initializeCanonical && documentId === CANONICAL_DOCUMENT_ID) {
    await ensureCanonicalDocument(viewer);
  }

  const document = await readDocument(documentId, database);
  const allowed = await isDocumentAccessAllowed(
    database,
    document,
    viewer,
    access,
  );
  if (!allowed) {
    throw new HostedDocumentError(
      "You do not have access to this hosted document.",
      403,
      "document_forbidden",
    );
  }
  return { viewer, document };
}

export async function readCanonicalDocument(
  database?: D1Database,
): Promise<HostedDocument> {
  const d1 = database ?? (await getDatabase());
  return readDocument(CANONICAL_DOCUMENT_ID, d1);
}

async function readDocument(
  documentId: string,
  database: D1Database,
): Promise<HostedDocument> {
  const d1 = database;
  const row = await d1
    .prepare(`
      SELECT id, title, markdown, version, review_state, created_at,
             updated_at, updated_by, schema_version, access_scope
      FROM documents
      WHERE id = ?
    `)
    .bind(documentId)
    .first<DocumentRow>();

  if (!row) {
    throw new HostedDocumentError(
      "Hosted document was not found.",
      404,
      "document_not_found",
    );
  }

  return documentFromRow(row);
}

export async function saveCanonicalDocument(input: {
  content: string;
  expectedVersion: string;
  viewer: HostedViewer;
  changeKind?: "edit" | "import" | "restore" | "confirmed-replace";
  confirmedReplace?: boolean;
}): Promise<HostedDocument | { conflict: HostedDocument }> {
  validateMarkdown(input.content);
  const database = await getDatabase();
  const current = await readCanonicalDocument(database);
  const requestedVersion = requireVersion(input.expectedVersion);
  const confirmedReplace =
    input.changeKind === "confirmed-replace" && input.confirmedReplace === true;
  if (!confirmedReplace && requestedVersion !== current.versionNumber) {
    return { conflict: current };
  }
  const baseVersion = current.versionNumber;
  const replacedBaseVersion = confirmedReplace ? requestedVersion : null;
  const nextVersion = baseVersion + 1;
  const now = new Date().toISOString();
  const title = titleFromMarkdown(input.content);

  const results = await database.batch([
    database
      .prepare(`
        UPDATE documents
        SET title = ?, markdown = ?, version = ?, review_state = 'in_review',
            updated_at = ?, updated_by = ?
        WHERE id = ? AND version = ?
      `)
      .bind(
        title,
        input.content,
        nextVersion,
        now,
        input.viewer.email,
        CANONICAL_DOCUMENT_ID,
        baseVersion,
      ),
    database
      .prepare(`
        INSERT INTO document_versions (
          document_id, version, markdown, author_email, author_name,
          change_kind, base_version, replaced_base_version, source_sha256,
          created_at
        )
        SELECT id, version, markdown, ?, ?, ?, ?, ?, ?, ?
        FROM documents
        WHERE id = ? AND version = ? AND updated_at = ?
      `)
      .bind(
        input.viewer.email,
        input.viewer.displayName,
        input.changeKind ?? "edit",
        baseVersion,
        replacedBaseVersion,
        await sha256(input.content),
        now,
        CANONICAL_DOCUMENT_ID,
        nextVersion,
        now,
      ),
  ]);

  if ((results[0].meta.changes ?? 0) !== 1) {
    return { conflict: await readCanonicalDocument(database) };
  }

  return readCanonicalDocument(database);
}

export async function completeCanonicalReview(input: {
  expectedVersion: string;
  overallComment?: string;
  viewer: HostedViewer;
}): Promise<HostedDocument | { conflict: HostedDocument }> {
  const database = await getDatabase();
  const current = await readCanonicalDocument(database);
  const expected = requireVersion(input.expectedVersion);
  if (expected !== current.versionNumber) {
    return { conflict: current };
  }

  const overallComment = input.overallComment?.trim();
  if (overallComment && overallComment.length > MAX_OVERALL_COMMENT_LENGTH) {
    throw new Error(
      `Overall comment must be ${MAX_OVERALL_COMMENT_LENGTH} characters or fewer.`,
    );
  }

  const content = overallComment
    ? appendRoughdraftDocumentComment(current.content, {
        message: overallComment,
        author: input.viewer.displayName,
      })
    : current.content;
  validateMarkdown(content);
  const resultingVersion =
    content === current.content
      ? current.versionNumber
      : current.versionNumber + 1;
  const summary = extractRoughdraftReviewIndex(content).summary;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (resultingVersion !== current.versionNumber) {
    statements.push(
      database
        .prepare(`
          UPDATE documents
          SET title = ?, markdown = ?, version = ?, review_state = 'reviewed',
              updated_at = ?, updated_by = ?
          WHERE id = ? AND version = ?
        `)
        .bind(
          titleFromMarkdown(content),
          content,
          resultingVersion,
          now,
          input.viewer.email,
          CANONICAL_DOCUMENT_ID,
          current.versionNumber,
        ),
      database
        .prepare(`
          INSERT INTO document_versions (
            document_id, version, markdown, author_email, author_name,
            change_kind, base_version, source_sha256, created_at
          )
          SELECT id, version, markdown, ?, ?, 'review-comment',
                 ?, ?, ?
          FROM documents
          WHERE id = ? AND version = ? AND updated_at = ?
        `)
        .bind(
          input.viewer.email,
          input.viewer.displayName,
          current.versionNumber,
          await sha256(content),
          now,
          CANONICAL_DOCUMENT_ID,
          resultingVersion,
          now,
        ),
    );
  } else {
    statements.push(
      database
        .prepare(`
          UPDATE documents
          SET review_state = 'reviewed', updated_at = ?, updated_by = ?
          WHERE id = ? AND version = ?
        `)
        .bind(
          now,
          input.viewer.email,
          CANONICAL_DOCUMENT_ID,
          current.versionNumber,
        ),
    );
  }
  statements.push(
    database
      .prepare(`
        INSERT INTO review_events (
          id, document_id, version, reviewer_email, reviewer_name,
          overall_comment, summary_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        CANONICAL_DOCUMENT_ID,
        resultingVersion,
        input.viewer.email,
        input.viewer.displayName,
        overallComment ?? null,
        JSON.stringify(summary),
        now,
      ),
  );
  const results = await database.batch(statements);
  if ((results[0].meta.changes ?? 0) !== 1) {
    return { conflict: await readCanonicalDocument(database) };
  }

  return readCanonicalDocument(database);
}

export async function listCanonicalActivity(): Promise<{
  versions: Array<{
    version: number;
    authorName: string;
    changeKind: string;
    createdAt: string;
  }>;
  reviews: Array<{
    id: string;
    version: number;
    reviewerName: string;
    overallComment: string | null;
    summary: Record<string, number>;
    createdAt: string;
  }>;
}> {
  const database = await getDatabase();
  const versionRows = await database
    .prepare(`
      SELECT version, author_name, change_kind, created_at
      FROM document_versions
      WHERE document_id = ?
      ORDER BY version DESC
      LIMIT 30
    `)
    .bind(CANONICAL_DOCUMENT_ID)
    .all<{
      version: number;
      author_name: string | null;
      change_kind: string;
      created_at: string;
    }>();
  const reviewRows = await database
    .prepare(`
      SELECT id, version, reviewer_name, overall_comment,
             summary_json, created_at
      FROM review_events
      WHERE document_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `)
    .bind(CANONICAL_DOCUMENT_ID)
    .all<{
      id: string;
      version: number;
      reviewer_name: string | null;
      overall_comment: string | null;
      summary_json: string;
      created_at: string;
    }>();

  return {
    versions: versionRows.results.map((row) => ({
      version: row.version,
      authorName: safeHostedDisplayName(row.author_name),
      changeKind: row.change_kind,
      createdAt: row.created_at,
    })),
    reviews: reviewRows.results.map((row) => ({
      id: row.id,
      version: row.version,
      reviewerName: safeHostedDisplayName(row.reviewer_name),
      overallComment: row.overall_comment,
      summary: safelyParseSummary(row.summary_json),
      createdAt: row.created_at,
    })),
  };
}

export async function restoreCanonicalVersion(input: {
  version: number;
  expectedVersion: string;
  viewer: HostedViewer;
}): Promise<HostedDocument | { conflict: HostedDocument }> {
  const database = await getDatabase();
  const row = await database
    .prepare(`
      SELECT markdown
      FROM document_versions
      WHERE document_id = ? AND version = ?
    `)
    .bind(CANONICAL_DOCUMENT_ID, input.version)
    .first<{ markdown: string }>();

  if (!row) {
    throw new Error(`Version ${input.version} was not found.`);
  }

  return saveCanonicalDocument({
    content: row.markdown,
    expectedVersion: input.expectedVersion,
    viewer: input.viewer,
    changeKind: "restore",
  });
}

export async function findAsset(path: string): Promise<{
  objectKey: string;
  mimeType: string;
  filename: string;
} | null> {
  const database = await getDatabase();
  const row = await database
    .prepare(`
      SELECT object_key, mime_type, filename
      FROM assets
      WHERE document_id = ? AND markdown_path = ?
    `)
    .bind(CANONICAL_DOCUMENT_ID, path)
    .first<{
      object_key: string;
      mime_type: string;
      filename: string;
    }>();

  return row
    ? {
        objectKey: row.object_key,
        mimeType: row.mime_type,
        filename: row.filename,
      }
    : null;
}

export async function recordAsset(input: {
  id: string;
  markdownPath: string;
  objectKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  viewer: HostedViewer;
}): Promise<void> {
  const database = await getDatabase();
  await database
    .prepare(`
      INSERT INTO assets (
        id, document_id, markdown_path, object_key, filename, mime_type,
        size_bytes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.id,
      CANONICAL_DOCUMENT_ID,
      input.markdownPath,
      input.objectKey,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.viewer.email,
      new Date().toISOString(),
    )
    .run();
}

function documentFromRow(row: DocumentRow): HostedDocument {
  return {
    id: row.id,
    title: row.title,
    content: row.markdown,
    version: versionToken(row.version),
    versionNumber: row.version,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    path: CANONICAL_DOCUMENT_PATH,
    mode: "sites-hosted",
    canonical: "hosted-record",
    schemaVersion: row.schema_version,
    accessScope: row.access_scope,
    capabilities: {
      sharedPersistence: true,
      optimisticConcurrency: true,
      importExport: true,
      localFileSync: false,
    },
  };
}

function versionToken(version: number): string {
  return `d1:${version}`;
}

function parseVersion(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/^d1:(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function requireVersion(value: string): number {
  const version = parseVersion(value);
  if (version === null) {
    throw new HostedDocumentError(
      "A valid expectedVersion is required.",
      428,
      "expected_version_required",
    );
  }
  return version;
}

function titleFromMarkdown(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || CANONICAL_DOCUMENT_PATH;
}

function validateMarkdown(content: string): void {
  if (typeof content !== "string") {
    throw new Error("Markdown content is required.");
  }
  if (new TextEncoder().encode(content).byteLength > MAX_MARKDOWN_BYTES) {
    throw new Error("Markdown documents must be 1 MB or smaller.");
  }
  const validation = validateRoughdraftMarkdown(content);
  if (!validation.ok) {
    throw new HostedDocumentError(
      "Markdown contains invalid Roughdraft review markup.",
      422,
      "invalid_roughdraft_markdown",
      { diagnostics: validation.errors },
    );
  }
}

async function isDocumentAccessAllowed(
  database: D1Database,
  document: HostedDocument,
  viewer: HostedViewer,
  access: DocumentAccess,
): Promise<boolean> {
  if (document.accessScope === "site-members") return true;
  if (
    document.accessScope === "owner-only" &&
    document.updatedBy === viewer.email
  ) {
    return true;
  }
  const member = await database
    .prepare(
      `SELECT role FROM document_members
       WHERE document_id = ? AND member_email = ?`,
    )
    .bind(document.id, viewer.email)
    .first<{ role: string }>();
  if (!member) return false;
  return (
    access === "read" || member.role === "owner" || member.role === "editor"
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safelyParseSummary(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
}
