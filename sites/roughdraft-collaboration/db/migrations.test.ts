// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySitesMigrations,
  sitesMigrations,
  SITES_SCHEMA_VERSION,
} from "./migrations";

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

    expect(applied).toHaveLength(4);
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "schema_version",
        "access_scope",
        "virtual_path",
        "owner_email",
      ]),
    );
    expect(SITES_SCHEMA_VERSION).toBe(4);
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
        `SELECT markdown, version, schema_version, access_scope,
                virtual_path, owner_email
         FROM documents WHERE id = 'roughdraft-skill'`,
      )
      .get() as {
      markdown: string;
      version: number;
      schema_version: number;
      access_scope: string;
      virtual_path: string;
      owner_email: string;
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
      schema_version: 4,
      access_scope: "site-members",
      virtual_path: "roughdraft-SKILL.md",
      owner_email: "owner@example.test",
    });
    expect(history).toEqual([{ markdown: "# Preserved" }]);

    expect(() =>
      database
        ?.prepare(
          `UPDATE documents
           SET owner_email = 'other@example.test'
           WHERE id = 'roughdraft-skill'`,
        )
        .run(),
    ).toThrow(/owner_email is immutable/);
  });

  it("preserves display casing while rejecting case-only path duplicates", async () => {
    database = new DatabaseSync(":memory:");
    await applySitesMigrations(d1(database));

    database
      .prepare(
        `INSERT INTO documents (
           id, slug, title, markdown, updated_by, virtual_path, owner_email
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "first",
        "first",
        "Plan",
        "# Plan",
        "owner@example.test",
        "Briefs/Plan.md",
        "owner@example.test",
      );

    expect(
      database
        .prepare("SELECT virtual_path FROM documents WHERE id = 'first'")
        .get(),
    ).toEqual({ virtual_path: "Briefs/Plan.md" });
    expect(() =>
      database
        ?.prepare(
          `INSERT INTO documents (
             id, slug, title, markdown, updated_by, virtual_path, owner_email
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "second",
          "second",
          "Plan copy",
          "# Plan copy",
          "owner@example.test",
          "briefs/plan.md",
          "owner@example.test",
        ),
    ).toThrow(/UNIQUE constraint failed: documents\.virtual_path/);
  });

  it("moves pre-existing case-only collisions aside before adding the NOCASE index", async () => {
    async function migrateFixture() {
      const fixture = new DatabaseSync(":memory:");
      try {
        fixture.exec(`CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY NOT NULL,
          applied_at TEXT NOT NULL
        )`);
        for (const migration of sitesMigrations.slice(0, 3)) {
          for (const statement of migration.statements) fixture.exec(statement);
          fixture
            .prepare(
              "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
            )
            .run(migration.id, "2026-07-25T00:00:00.000Z");
        }
        const insert = fixture.prepare(
          `INSERT INTO documents (
             id, slug, title, markdown, updated_by, virtual_path, owner_email
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const row of [
          ["first-document", "Briefs/Plan.md"],
          ["second-document", "briefs/plan.md"],
          ["first-notes", "Notes/Readme.markdown"],
          ["second-notes", "notes/readme.MARKDOWN"],
        ] as const) {
          insert.run(
            row[0],
            row[0],
            "Document",
            "# Document",
            "owner@example.test",
            row[1],
            "owner@example.test",
          );
        }

        await applySitesMigrations(d1(fixture));
        return fixture
          .prepare("SELECT id, virtual_path FROM documents ORDER BY id")
          .all() as Array<{ id: string; virtual_path: string }>;
      } finally {
        fixture.close();
      }
    }

    const expected = [
      { id: "first-document", virtual_path: "Briefs/Plan.md" },
      { id: "first-notes", virtual_path: "Notes/Readme.markdown" },
      {
        id: "second-document",
        virtual_path: "path-conflicts/second_document.md",
      },
      {
        id: "second-notes",
        virtual_path: "path-conflicts/second_notes.markdown",
      },
    ];
    expect(await migrateFixture()).toEqual(expected);
    expect(await migrateFixture()).toEqual(expected);
  });
});
