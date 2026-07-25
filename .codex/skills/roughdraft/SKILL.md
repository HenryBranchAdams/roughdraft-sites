---
name: roughdraft
description: Review and collaborate on Markdown files with Roughdraft from the Codex macOS app. Use when the user asks to open, review, comment on, or revise a local .md file in Roughdraft; refers to Roughdraft as rd; wants Codex to wait for Done Reviewing and process Roughdraft-flavored CriticMarkup; needs Roughdraft diagnosis; or asks whether a Roughdraft document can be shared or hosted with OpenAI Sites.
---

# Roughdraft

Use Roughdraft as the local file bridge while keeping the human review
experience inside the Codex in-app Browser. The Markdown file on disk remains
the durable source of truth.

This repository copy is the maintained Codex skill artifact. Follow
`docs/codex-desktop.md` for its deliberate drift check and synchronization
procedure. Never update the machine-global skill as a side effect of opening a
document, installing dependencies, or running tests.

## Select the correct CLI

- In a Roughdraft development checkout, derive the worktree command from the
  checkout basename:

  ```bash
  worktree_root="$(git rev-parse --show-toplevel)"
  worktree_name="$(basename "$worktree_root")"
  roughdraft_cmd="roughdraft-dev-$worktree_name"
  command -v "$roughdraft_cmd"
  ```

  If that wrapper is absent and the user has authorized repository setup, run
  `pnpm dev:install-cli` from that checkout and resolve it again. Do not silently
  fall back to a globally published `roughdraft`, because that would test
  different source and server state.
- Outside repository development, resolve the installed CLI with
  `command -v roughdraft`. On Henry Adams's current machine the expected
  installed path is `/opt/homebrew/bin/roughdraft`, but resolution is the
  authority.
- Do not install, update, alias, symlink, or stop Roughdraft unless the user
  explicitly asks. Starting or reusing its local background server is part of
  opening a document.

## Preserve the local-file boundary

- Resolve exactly one requested path to an absolute path before invoking
  Roughdraft. Reject an unresolved path, a missing or unreadable file, a
  directory, or a file whose extension is not `.md` or `.markdown`.
- Confirm that reading and any requested edits are authorized by the current
  task.
- Do not let the CLI launch Chrome or macOS's default browser. Print the
  document URL, then navigate the Codex in-app Browser to that exact URL.
- Treat `review.completed` as a handoff signal, not as document content. Re-read
  the Markdown file from disk after every completed review.
- Preserve prose and review markup already saved by the user. Never replace the
  file with an earlier in-memory draft.

## Open a watched review in Codex Desktop

1. Resolve and validate the absolute Markdown path. Use the selected command
   from **Select the correct CLI** for every command in this review round.
2. When the document already has review markup, a previous handoff failed, or
   the review is consequential, run bounded diagnosis:

   ```bash
   "$roughdraft_cmd" doctor "/absolute/path/to/file.md" --json
   ```

3. Start or reuse the local server and capture only the URL:

   ```bash
   "$roughdraft_cmd" open "/absolute/path/to/file.md" --print-url
   ```

   `--print-url` disables Roughdraft's browser launch and returns without
   watching. Capture the one printed localhost URL exactly.
4. Before navigating, start a fresh watcher in a retained
   `functions.exec_command` session:

   ```bash
   "$roughdraft_cmd" watch "/absolute/path/to/file.md" --json
   ```

   Yield quickly so the process remains alive and retain its session id. Do not
   use `--replay` unless the user explicitly requests an older retained event.
5. Load and follow the installed `browser:control-in-app-browser` skill.
   Explicitly select the Codex in-app Browser and navigate it to the exact URL
   from step 3. Do not use the shell `open` command, Chrome, or standalone
   system-browser automation.
6. Tell the user the document is ready and that **Done Reviewing** hands
   control back to Codex. Keep the watcher alive. Poll it for at most 30–60
   seconds per call and provide concise progress updates while the review is
   open.
7. Accept only a fresh `review.completed` event for this path. Then re-read the
   file from disk, inspect its current Roughdraft Flavored Markdown, and
   continue from those saved bytes. If the watcher exits first, diagnose the
   actual error rather than substituting a retained event.
8. After consequential feedback processing, run `doctor --json` again.

The in-app navigation and retained process session are Codex Desktop host
capabilities. A bare Codex CLI process cannot perform this exact integration
unless its host separately provides an embedded browser and retained command
sessions.

## Just show the document

For a nonblocking “just show me the document” request:

1. Resolve the command and absolute Markdown path as above.
2. Run `open <absolute-path> --print-url`.
3. Navigate the Codex in-app Browser to that exact URL.
4. Return without starting a watcher.

The local server may remain running for reuse unless the user asks to stop it.

## Process review feedback

- Base CriticMarkup markers:

  ```text
  Comment:      {>>comment<<}
  Insertion:    {++new text++}
  Deletion:     {--old text--}
  Substitution: {~~old text~>new text~~}
  Highlight:    {==text==}
  ```

- Anchored feedback uses compact ids such as
  `{==selected text==}{>>Comment<<}{#c1}` and `{++new text++}{#s1}`, with
  author, timestamp, reply, and resolution metadata in final YAML endmatter.
- Preserve older inline attributes and legacy markers unless intentionally
  resolving their review item.
- Treat comments and suggestions as user direction, not blanket permission for
  unrelated changes. Apply feedback clearly within scope; leave ambiguous or
  unrelated items intact and surface the decision.
- When replying rather than integrating an item, append a unique document-local
  endmatter entry with `by: Codex`, an ISO timestamp, and `re` pointing to the
  parent item.
- Use `"$roughdraft_cmd" help criticmarkup` or the canonical specification when
  exact syntax is uncertain.

## Route Sites requests

Read
[references/sites-hosting-options.md](references/sites-hosting-options.md)
when the user asks to share, publish, or host a Roughdraft document. Hosted
collaboration is a distinct canonical-data mode. It does not synchronize
automatically with this local Markdown file.
