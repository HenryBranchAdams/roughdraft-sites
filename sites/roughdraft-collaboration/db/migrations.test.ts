// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applySitesMigrations, SITES_SCHEMA_VERSION } from "./migrations";

class Prepared {
  constructor(
    readonly database: DatabaseSync,
    readonly sql: string,
    readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Prepared(this.database, this.sql, values as SQLInputValue[]);
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }

  all<T>() {
    return {
      success: true,
      meta: { changes: 0 },
      results: this.database.prepare(this.sql).all(...this.values) as T[],
    };
  }
}

function d1(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      return new Prepared(database, sql);
    },
    async batch(statements: Prepared[]) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

describe("Sites D1 migrations", () => {
  let database: DatabaseSync | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("creates the current schema and reruns as a no-op", async () => {
    database = new DatabaseSync(":memory:");
    const adapter = d1(database);

    await applySitesMigrations(adapter);
    await applySitesMigrations(adapter);

    const applied = database
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all();
    const columns = database
      .prepare("PRAGMA table_info(documents)")
      .all() as Array<{ name: string }>;

    expect(applied).toHaveLength(2);
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["schema_version", "access_scope"]),
    );
    expect(SITES_SCHEMA_VERSION).toBe(2);
  });

  it("upgrades a v1 document without changing its Markdown or history", async () => {
    database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        review_state TEXT NOT NULL DEFAULT 'in_review',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      );
      CREATE TABLE document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id),
        version INTEGER NOT NULL,
        markdown TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT,
        change_kind TEXT NOT NULL DEFAULT 'edit',
        created_at TEXT NOT NULL
      );
      INSERT INTO documents VALUES (
        'roughdraft-skill', 'roughdraft-skill', 'Draft', '# Preserved',
        1, 'in_review', '2026-07-23', '2026-07-23', 'owner@example.test'
      );
      INSERT INTO document_versions (
        document_id, version, markdown, author_email, author_name,
        change_kind, created_at
      ) VALUES (
        'roughdraft-skill', 1, '# Preserved', 'owner@example.test',
        'Owner', 'seed', '2026-07-23'
      );
    `);

    await applySitesMigrations(d1(database));

    const document = database
      .prepare(
        `SELECT markdown, version, schema_version, access_scope
         FROM documents WHERE id = 'roughdraft-skill'`,
      )
      .get() as {
      markdown: string;
      version: number;
      schema_version: number;
      access_scope: string;
    };
    const history = database
      .prepare(
        `SELECT markdown FROM document_versions
         WHERE document_id = 'roughdraft-skill'`,
      )
      .all() as Array<{ markdown: string }>;

    expect(document).toEqual({
      markdown: "# Preserved",
      version: 1,
      schema_version: 2,
      access_scope: "site-members",
    });
    expect(history).toEqual([{ markdown: "# Preserved" }]);
  });
});
