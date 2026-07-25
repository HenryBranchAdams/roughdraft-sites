# Hosting Roughdraft documents with Sites

Use this reference only for a Sites-related request. Follow the installed
`sites-building` and `sites-hosting` skills for implementation and deployment.

## Choose the product honestly

| Mode | What the reader gets | Persistence | Local-file round trip | Default recommendation |
| --- | --- | --- | --- | --- |
| Private snapshot | A shareable rendering of one reviewed Markdown file | New deployment/version when republished | No | Yes, for reading |
| Browser-local editor | Roughdraft-like editing saved in one browser | `localStorage` only | No | Demo only |
| Sites-native review app | Shared comments and suggestions in Sites-owned storage | D1 canonical record; R2 only for appropriate assets | Explicit Markdown import/export | Yes, for hosted collaboration |
| Upstream remote session | Editor connected to a live CLI bridge | In-memory session plus the CLI-owned file | Yes, while the CLI remains connected | Not a normal Sites document |

## Sites-native collaboration boundary

- The hosted D1 record is canonical. A local file is canonical only after an
  explicit export and local workflow handoff.
- A Sites worker cannot write a file on a user's Mac. Never imply automatic
  local-file synchronization.
- Store the complete Roughdraft Flavored Markdown source in D1. Keep comments,
  suggestions, replies, authorship, timestamps, resolution state, and overall
  comments portable in RFM/CriticMarkup and YAML endmatter.
- Derive identity from supported Sites authentication headers and enforce
  document authorization server-side. Never put bearer tokens, email addresses,
  credentials, private file paths, or sensitive identifiers in URLs.
- Require an expected version for mutations. A stale write must return a clear
  conflict and recovery choice rather than overwrite a newer version.
- Use R2 for private, authorized attachment storage only. It is not the
  canonical Markdown or review metadata store.
- Label the interface “Sites-hosted collaboration,” identify the hosted record
  as canonical, and state that export does not update a local Mac file.
- Preserve the community-fork disclaimer, Lex upstream attribution, and MIT
  license.

An always-on Mac bridge, bidirectional synchronization, public tunneling,
background filesystem access, and CRDT editing are separate deferred products.
Do not start or expose any such bridge without explicit authorization and a
bounded security design.

## Snapshot lane

Use a snapshot when the goal is to share a document for reading rather than
keep a shared review record:

1. Confirm the exact Markdown file, unresolved-feedback treatment, and intended
   access.
2. Re-read the file immediately before building.
3. Render a frozen snapshot while preserving headings, tables, task lists,
   code, links, and intentional CriticMarkup presentation.
4. Label the page as a snapshot and include a source timestamp or content hash.
5. State that hosted changes do not flow back to the local file.

## Deployment boundary

Exploration and local implementation do not authorize deployment. Before a
Sites action, inspect `.openai/hosting.json` and reuse its exact opaque
`project_id` and existing binding names. Never create a replacement site merely
because a title or slug looks related.

Before saving or deploying a version, resolve:

- the exact validated source commit;
- snapshot versus Sites-native collaboration;
- intended access mode;
- treatment of unresolved review markup and sensitive content; and
- whether future local changes require explicit import or republication.

Every Sites deployment URL is production. Do not save a version, deploy, or
change access controls without explicit authorization.
