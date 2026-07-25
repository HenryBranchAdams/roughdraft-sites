# Roughdraft Sites collaboration

> **Community fork:** This is an independently maintained, unofficial
> Sites-native adaptation of
> [Lex-Inc/roughdraft](https://github.com/Lex-Inc/roughdraft). It is not
> affiliated with or endorsed by Lex, and it is not Henry Adams's original
> brand. Roughdraft remains Copyright (c) Nathan Baschez and MIT licensed.

Each Sites-hosted document is canonical in this mode. Cloudflare D1 stores the
current Markdown, immutable owner identity, safe virtual path, version history,
review events, and attachment metadata; R2 stores attachment bytes. The editor
retains Roughdraft's rich-text and Markdown modes, comments, replies,
suggestions, review rail, RFM/CriticMarkup serialization, and exact Markdown
import/export.

The document navigator is a Markdown-only adaptation of Extend UI's
`@extend/file-system`: a flat hosted manifest with derived folders, Finder-style
icon/list/column/gallery views, keyboard navigation, search, sorting, and a
compact responsive view selector. It does not install heavy PDF or Office
viewers. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

New and import are explicit same-origin operations that create a stable,
opaque document id independently of its validated virtual path. Export
explicitly downloads the selected document's current Roughdraft Flavored
Markdown. Neither action silently updates a Markdown file on a Mac. Rename and
delete are intentionally outside this workspace.

Site admission is enforced by OpenAI Sites. The application additionally
enforces each document's stored `access_scope` (`site-members`, `restricted`,
or `owner-only`) on every document, history, review, export, and asset route.
Every route resolves the authorized document before passing its stable id into
storage queries; client-supplied identity is ignored.
This source does not assert a particular live access mode and does not change
site access controls.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Local Vinext development simulates the logical `DB` and `FILES` bindings
declared in `.openai/hosting.json`.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run check:rfm
```

With the development server running, `node tests/local-smoke.mjs` exercises the
live local D1/R2 workflow: canonical load/export, optimistic save, stale-write
rejection, review completion, history, and attachment round-tripping.

Runtime D1 upgrades are ordered in `db/migrations.ts`. Schema v3 adds a unique
virtual Markdown path and immutable `owner_email`, backfills the historical
`roughdraft-skill` record to `roughdraft-SKILL.md`, preserves existing
Markdown/history, and remains a no-op after its migration id is recorded. The
root route and APIs without a `document` parameter still open that original
canonical record. Keep `db/schema.ts` aligned with the migrations.

## Hosted boundary

The current site is the system of record for hosted collaboration. It does not
silently synchronize changes into the installed macOS Codex skill. Export the
canonical Markdown for a deliberate local update, or add a separately
authorized bridge later.

Normal writes require the exact hosted version read by the editor. Stale writes
return `409`; omitted versions return `428`; invalid RFM returns `422` with
diagnostics. The only overwrite path is a separately named, user-confirmed
replace that retains the replaced base version in immutable history.

## Fork ownership and delivery workspace

The maintainable source lives at `sites/roughdraft-collaboration/` in
[`HenryBranchAdams/roughdraft-sites`](https://github.com/HenryBranchAdams/roughdraft-sites).
The delivery workspace is synchronized deliberately:

```bash
node scripts/sync-sites-rfm.mjs --check
node scripts/sync-roughdraft-sites-workspace.mjs \
  --workspace /absolute/path/to/existing-sites-workspace
node scripts/sync-roughdraft-sites-workspace.mjs \
  --check --workspace /absolute/path/to/existing-sites-workspace
```

The synchronization command refuses a workspace whose opaque Sites project id
or logical `DB`/`FILES` binding names differ. It never replaces
`.openai/hosting.json`, and it records the public fork commit and deterministic
source hash in the delivery workspace. It does not save a Sites version or
deploy.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for upstream attribution.
