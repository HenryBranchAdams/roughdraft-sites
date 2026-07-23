import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    markdown: text("markdown").notNull(),
    version: integer("version").notNull().default(1),
    reviewState: text("review_state").notNull().default("in_review"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text("updated_by").notNull(),
    schemaVersion: integer("schema_version").notNull().default(2),
    accessScope: text("access_scope").notNull().default("site-members"),
  },
  (table) => [
    uniqueIndex("documents_slug_unique").on(table.slug),
    index("documents_updated_at_idx").on(table.updatedAt),
  ],
);

export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    version: integer("version").notNull(),
    markdown: text("markdown").notNull(),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name"),
    changeKind: text("change_kind").notNull().default("edit"),
    baseVersion: integer("base_version"),
    replacedBaseVersion: integer("replaced_base_version"),
    sourceSha256: text("source_sha256"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("document_versions_document_version_unique").on(
      table.documentId,
      table.version,
    ),
    index("document_versions_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const documentMembers = sqliteTable(
  "document_members",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    memberEmail: text("member_email").notNull(),
    role: text("role").notNull().default("reviewer"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("document_members_document_email_unique").on(
      table.documentId,
      table.memberEmail,
    ),
    index("document_members_email_idx").on(table.memberEmail),
  ],
);

export const reviewEvents = sqliteTable(
  "review_events",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    version: integer("version").notNull(),
    reviewerEmail: text("reviewer_email").notNull(),
    reviewerName: text("reviewer_name"),
    overallComment: text("overall_comment"),
    summaryJson: text("summary_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("review_events_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    markdownPath: text("markdown_path").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("assets_document_path_unique").on(
      table.documentId,
      table.markdownPath,
    ),
    index("assets_document_created_idx").on(table.documentId, table.createdAt),
  ],
);
