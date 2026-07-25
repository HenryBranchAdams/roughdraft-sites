---
name: roughdraft
description: Review and collaborate on Markdown files with Roughdraft from the Codex macOS app. Use when the user asks to open, review, comment on, or revise a local .md file in Roughdraft; refers to Roughdraft as rd; wants Codex to wait for Done Reviewing and process Roughdraft-flavored CriticMarkup; needs Roughdraft diagnosis; or asks whether a Roughdraft document can be shared or hosted with OpenAI Sites.
---

# Roughdraft

Use the installed Roughdraft process as the local file bridge while keeping the
human review experience inside the Codex in-app browser. Keep the Markdown file
on disk as the durable source of truth.

## Preserve the boundary

- Resolve `roughdraft` with `command -v` before using it. On this machine the
  expected installed path is `/opt/homebrew/bin/roughdraft`.
- Do not install, update, alias, symlink, or stop Roughdraft unless the user
  explicitly asks. Starting or reusing its local background server is part of
  opening a document.
- Do not let the CLI launch macOS's default browser. Print the document URL,
  then open that exact URL with the Codex in-app Browser.
- Open one Markdown file at a time. Resolve and validate an absolute path before
  passing it to Roughdraft.
- Treat `review.completed` as a handoff signal, not as document content. Re-read
  the Markdown file after every completed review.
- Preserve plain-text edits already saved by the user. Do not replace the file
  with an earlier in-memory draft.

## Open a local review in Codex Desktop

1. Confirm that the target is a readable Markdown file and that edits are
   authorized by the current task. Use `roughdraft doctor <absolute-path>
   --json` when the file already contains review markup, when troubleshooting,
   or before a consequential review round.
2. Start or reuse the local server and capture the document URL without opening
   an external browser:

   ```bash
   roughdraft open "/absolute/path/to/file.md" --print-url
   ```

3. Before showing the page, start a fresh watcher in a retained
   `functions.exec_command` session:

   ```bash
   roughdraft watch "/absolute/path/to/file.md" --json
   ```

   Yield quickly so the process remains alive instead of blocking the agent
   turn. Keep its session id. Do not use `--replay` unless the user explicitly
   wants an older retained event.
4. Load and follow the `control-in-app-browser` skill. Select the in-app browser
   explicitly and navigate it to the exact localhost URL printed in step 2.
   Do not use the shell `open` command, Chrome, or standalone browser
   automation.
5. Tell the user that the document is ready and that **Done Reviewing** hands
   control back to Codex. Keep the watcher alive. Poll it with
   `functions.write_stdin` for at most 30–60 seconds per call and send a concise
   progress update when the review remains open.
6. When the watcher emits `review.completed`, read the file again from disk,
   inspect the feedback, and continue the task. If the watcher exits without a
   completion event, inspect the real error before retrying.

For a non-blocking “just show me the file” request, omit the watcher and open
the printed URL directly. Keep the local server running for reuse unless the
user asks to stop it.

## Process review feedback

- Base CriticMarkup markers:

  ```text
  Comment:      {>>comment<<}
  Insertion:    {++new text++}
  Deletion:     {--old text--}
  Substitution: {~~old text~>new text~~}
  Highlight:    {==text==}
  ```

- New anchored feedback uses compact ids such as
  `{==selected text==}{>>Comment<<}{#c1}` and `{++new text++}{#s1}`, with
  author, timestamp, and reply metadata in final YAML endmatter.
- Preserve older inline attributes and legacy markers unless intentionally
  resolving their review item.
- Treat comments and suggestions as user direction, not blanket permission for
  unrelated changes. Apply feedback that is clearly within the current task;
  leave ambiguous or unrelated items intact and surface the decision.
- When replying rather than integrating an item, append a new endmatter entry
  with a unique document-local id, `by: Codex`, an ISO timestamp, and `re`
  pointing to the parent item.
- After editing, run `roughdraft doctor <absolute-path> --json`. Reopen another
  watched round when the user wants to continue the document conversation.

Use `roughdraft help criticmarkup` or the canonical upstream specification when
exact syntax or compatibility behavior is uncertain.

## Route Sites requests

Read [references/sites-hosting-options.md](references/sites-hosting-options.md)
when the user asks to share, publish, or host a Roughdraft document.
