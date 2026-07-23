export type SitesMigration = {
  id: string;
  statements: readonly string[];
};

export const SITES_SCHEMA_VERSION = 2;

export const sitesMigrations: readonly SitesMigration[] = [
  {
    id: "0001_existing_hosted_schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        review_state TEXT NOT NULL DEFAULT 'in_review',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT NOT NULL
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS documents_slug_unique ON documents (slug)",
      "CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents (updated_at)",
      `CREATE TABLE IF NOT EXISTS document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        version INTEGER NOT NULL,
        markdown TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT,
        change_kind TEXT NOT NULL DEFAULT 'edit',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS document_versions_document_version_unique ON document_versions (document_id, version)",
      "CREATE INDEX IF NOT EXISTS document_versions_document_created_idx ON document_versions (document_id, created_at)",
      `CREATE TABLE IF NOT EXISTS review_events (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        version INTEGER NOT NULL,
        reviewer_email TEXT NOT NULL,
        reviewer_name TEXT,
        overall_comment TEXT,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        markdown_path TEXT NOT NULL,
        object_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS assets_document_path_unique ON assets (document_id, markdown_path)",
      "CREATE INDEX IF NOT EXISTS assets_document_created_idx ON assets (document_id, created_at)",
      "CREATE INDEX IF NOT EXISTS review_events_document_created_idx ON review_events (document_id, created_at)",
    ],
  },
  {
    id: "0002_document_scope_and_audit",
    statements: [
      "ALTER TABLE documents ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE documents ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'site-members'",
      "ALTER TABLE document_versions ADD COLUMN base_version INTEGER",
      "ALTER TABLE document_versions ADD COLUMN replaced_base_version INTEGER",
      "ALTER TABLE document_versions ADD COLUMN source_sha256 TEXT",
      `CREATE TABLE IF NOT EXISTS document_members (
        document_id TEXT NOT NULL REFERENCES documents(id),
        member_email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'reviewer',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (document_id, member_email)
      )`,
      "CREATE INDEX IF NOT EXISTS document_members_email_idx ON document_members (member_email)",
      `UPDATE documents
       SET schema_version = 2,
           access_scope = CASE
             WHEN access_scope IN ('site-members', 'restricted', 'owner-only')
               THEN access_scope
             ELSE 'site-members'
           END`,
    ],
  },
];

export async function applySitesMigrations(
  database: D1Database,
): Promise<void> {
  await database
    .prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    )`)
    .run();

  const applied = await database
    .prepare("SELECT id FROM schema_migrations")
    .all<{ id: string }>();
  const appliedIds = new Set(applied.results.map((row) => row.id));

  for (const migration of sitesMigrations) {
    if (appliedIds.has(migration.id)) continue;
    const appliedAt = new Date().toISOString();
    await database.batch([
      ...migration.statements.map((sql) => database.prepare(sql)),
      database
        .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
        .bind(migration.id, appliedAt),
    ]);
  }
}
