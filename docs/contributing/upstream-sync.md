# Maintaining the Roughdraft Sites community fork

`HenryBranchAdams/roughdraft-sites` is an independently maintained public fork
of [`Lex-Inc/roughdraft`](https://github.com/Lex-Inc/roughdraft). It is not an
official Roughdraft release and is not affiliated with or endorsed by Lex.
Roughdraft remains Copyright (c) Nathan Baschez and MIT licensed.

## Remotes and sync policy

Keep the fork repository as `origin` and the official project as `upstream`:

```bash
git remote set-url origin https://github.com/HenryBranchAdams/roughdraft-sites.git
git remote add upstream https://github.com/Lex-Inc/roughdraft.git
git remote -v
git fetch --prune origin
git fetch --prune upstream
```

If `upstream` already exists, verify its URL rather than adding it again.

Prepare each upstream sync on a dedicated branch or isolated worktree. Merge
the selected upstream commit into that branch; do not force-push or rewrite the
public fork's shared history. Record the upstream commit and merge base in the
pull request. Resolve conflicts by preserving upstream local-file behavior and
then deliberately reapplying the fork boundaries below.

## Fork-specific conflict hotspots

- `README.md`, root `package.json`, and `.github/workflows/publish.yml`: keep
  the prominent community-fork disclaimer and publication safeguards.
- `.codex/skills/roughdraft/`, `packages/skill/`,
  `scripts/sync-codex-skill.mjs`, and `docs/codex-desktop.md`: preserve the
  Codex Desktop in-app Browser workflow and deliberate global-skill sync.
- `packages/app/src/storage.ts`: retain the distinct `sites-hosted` capability
  kind without changing upstream local, browser-local, or remote semantics.
- `sites/roughdraft-collaboration/`,
  `scripts/sync-sites-rfm.mjs`, and
  `scripts/sync-roughdraft-sites-workspace.mjs`: retain D1 canonical storage,
  R2-only assets, authorization, concurrency, import/export, attribution, and
  exact Sites project/binding checks.
- `docs/spec/roughdraft-flavored-markdown.md` and the screenshot guide:
  preserve RFM 0.2 consistency and hosted-state verification guidance.

Never resolve a conflict by copying hosted persistence into the upstream local
server. Local files, browser-local demo data, transient remote sessions, and
Sites-hosted records remain distinct storage modes.

## Post-sync verification

Install dependencies and validate the merged fork:

```bash
pnpm install --frozen-lockfile
pnpm test:fork-safety
pnpm check
pnpm test:smoke
node scripts/sync-sites-rfm.mjs --check
```

Validate the fork-owned Sites source with its existing package manager:

```bash
cd sites/roughdraft-collaboration
npm ci
npm run check:rfm
npm run typecheck
npm run lint
npm test
```

When preparing the existing Sites delivery workspace, synchronize explicitly
and verify drift:

```bash
node scripts/sync-roughdraft-sites-workspace.mjs \
  --workspace /absolute/path/to/existing-sites-workspace
node scripts/sync-roughdraft-sites-workspace.mjs \
  --check --workspace /absolute/path/to/existing-sites-workspace
```

The sync refuses a workspace with a different opaque project id or different
logical D1/R2 bindings and never replaces `.openai/hosting.json`. Saving a
Sites version, deploying, or changing access remains a separate authorized
delivery action.

## Package releases are not a fork capability

The `roughdraft` package on npm is the official upstream release lane. This
fork intentionally keeps the inherited root package name for compatible local
development and CLI behavior, but marks the root package private and replaces
the inherited publisher with a read-only safeguard workflow.

Do not publish, tag, or configure trusted publishing for `roughdraft` from this
repository. A future fork package would require a separately approved,
fork-namespaced package identity and release design.
