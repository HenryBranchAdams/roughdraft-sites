# Codex Desktop integration

This community fork maintains a repository-owned Codex skill at
`.codex/skills/roughdraft`. It coordinates Roughdraft's local file server with
the Codex macOS app's in-app Browser. It does not add Codex, OpenProse, or Sites
as a Roughdraft runtime dependency.

## Canonical-data boundary

For this workflow, one absolute Markdown file on disk is canonical. The local
server, URL, watcher, and `review.completed` event are coordination mechanisms,
not copies of the document. After **Done Reviewing**, Codex must reread the
file and process its current Roughdraft Flavored Markdown without replacing
prose the user already saved.

Hosted Sites collaboration is a different storage mode. A Sites-hosted D1
record cannot automatically update a file on the Mac; moving between modes
requires explicit Markdown import or export.

## Development command

Repository development must use the worktree-specific wrapper so testing
cannot accidentally reuse the published package or another checkout's server:

```bash
worktree_root="$(git rev-parse --show-toplevel)"
worktree_name="$(basename "$worktree_root")"
roughdraft_cmd="roughdraft-dev-$worktree_name"
command -v "$roughdraft_cmd" >/dev/null || pnpm dev:install-cli
command -v "$roughdraft_cmd"
```

For this checkout the expected command is
`roughdraft-dev-roughdraft-sites`. Outside repository development, the
installed skill resolves `roughdraft` normally.

## Watched review flow

Codex Desktop performs these actions in order:

1. Resolve exactly one `.md` or `.markdown` path to an absolute path. Reject a
   missing, unreadable, directory, non-Markdown, or unresolved input.
2. Optionally diagnose current markup:

   ```bash
   "$roughdraft_cmd" doctor "/absolute/path/to/document.md" --json
   ```

3. Start or reuse the local server without launching Chrome or the system
   browser:

   ```bash
   "$roughdraft_cmd" open "/absolute/path/to/document.md" --print-url
   ```

4. Before exposing the page, retain a fresh watcher process:

   ```bash
   "$roughdraft_cmd" watch "/absolute/path/to/document.md" --json
   ```

5. Use Codex's installed `browser:control-in-app-browser` skill to navigate the
   in-app Browser to the exact printed localhost URL.
6. Keep the watcher alive until it returns a fresh `review.completed` event.
   Do not request replay by default.
7. Reread the Markdown file from disk, process its current review markup, and
   run diagnosis again after consequential changes.

For “just show me the document,” perform path validation and the
`open --print-url` step, navigate the in-app Browser, and omit the watcher.

`--print-url` is important: Roughdraft treats it as `--no-open`, prints only the
document URL, and returns without registering the implicit `open` watcher. The
separate retained `watch --json` process gives Codex an explicit handoff
boundary and must be started before in-app navigation.

## Host requirements and limitations

- In-app navigation requires the Codex macOS app and its embedded Browser
  control capability. Running the ordinary Roughdraft CLI does not constitute
  Codex Desktop integration.
- A bare Codex CLI agent cannot reproduce this workflow unless its host
  separately provides an embedded browser and retained process sessions.
- The skill never launches Chrome, invokes the shell `open` command, installs
  Roughdraft, changes global Codex instructions, or stops an existing server
  without explicit authorization.
- Roughdraft still opens one Markdown file at a time. It is not a project
  filesystem browser.

## Global skill drift check and synchronization

The repository copy is the source artifact. Check the installed copy without
writing it:

```bash
pnpm codex-skill:check
```

The command prints the repository and global destinations, their SHA-256 tree
hashes, and any missing, changed, or extra files. A drift result exits nonzero.

To review the write behavior safely, synchronize to a temporary directory:

```bash
temporary_destination="$(mktemp -d)/roughdraft"
node scripts/sync-codex-skill.mjs --install \
  --destination "$temporary_destination"
node scripts/sync-codex-skill.mjs --check \
  --destination "$temporary_destination"
```

Updating the real machine-global skill is a separate, explicit action:

```bash
pnpm codex-skill:install
```

The install action copies only `SKILL.md`, `agents/openai.yaml`, and
`references/sites-hosting-options.md`. It refuses a destination containing
unknown files, symbolic links, or a `SKILL.md` for another named skill. It never
runs from install hooks, repository setup, tests, CLI startup, or Sites builds.
Review the diff and hashes before authorizing the real install.

## Focused verification

Run the deterministic skill and drift checks:

```bash
pnpm test:codex-skill
pnpm codex-skill:check
```

The first command uses temporary destinations and never writes the global
skill. End-to-end Desktop verification additionally requires a real temporary
Markdown file, the worktree-specific CLI, a retained watcher, the Codex in-app
Browser, and a user action on **Done Reviewing**.
