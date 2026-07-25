"use client";

import {
  Activity,
  Cloud,
  Download,
  FilePlus2,
  FileUp,
  History,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DocumentEditorViewMode } from "./roughdraft-ui/app-navigation";
import { DocumentWorkspace } from "./roughdraft-ui/DocumentWorkspace";
import {
  HostedBackend,
  type HostedDocumentListItem,
  type HostedPage,
  type HostedViewer,
} from "./roughdraft-ui/hosted-backend";
import {
  MarkdownFileSystem,
  type MarkdownFileSystemProps,
} from "./roughdraft-ui/MarkdownFileSystem";
import { chooseHostedExternalUpdateAction } from "./roughdraft-ui/hosted-sync-policy";
import type { DocumentSaveState } from "./roughdraft-ui/PageCard";
import { Button } from "./roughdraft-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./roughdraft-ui/components/ui/dialog";
import { Input } from "./roughdraft-ui/components/ui/input";
import { gateHostedDocumentTransition } from "./roughdraft-ui/hosted-dialog-policy";
import {
  type CompleteReviewOptions,
  MarkdownFileConflictError,
} from "./roughdraft-ui/storage";

type ConflictState = "clean" | "changed" | "conflict" | "paused";
type ActivityPayload = {
  versions: Array<{
    version: number;
    authorName: string;
    changeKind: string;
    createdAt: string;
  }>;
  reviews: Array<{
    id: string;
    version: number;
    reviewerName: string;
    overallComment: string | null;
    summary: Record<string, number>;
    createdAt: string;
  }>;
};

type DocumentTransitionAction =
  | { kind: "switch"; documentId: string }
  | { kind: "create"; path: string }
  | { kind: "import"; path: string; file: File };

type PathDialogState =
  | { kind: "create"; path: string }
  | { kind: "import"; path: string; file: File };

type ConfirmationDialogState =
  | { kind: "discard"; action: DocumentTransitionAction }
  | { kind: "replace" }
  | { kind: "restore"; version: number; path: string };

const CANONICAL_DOCUMENT_ID = "roughdraft-skill";
const DOCUMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function initialDocumentId(): string {
  if (typeof window === "undefined") return CANONICAL_DOCUMENT_ID;
  const value = new URL(window.location.href).searchParams.get("document");
  return value && DOCUMENT_ID_PATTERN.test(value)
    ? value
    : CANONICAL_DOCUMENT_ID;
}

function documentUrl(path: string, documentId: string): string {
  const params = new URLSearchParams({ document: documentId });
  return `${path}?${params.toString()}`;
}

export default function HostedRoughdraft() {
  const [activeDocumentId, setActiveDocumentId] = useState(initialDocumentId);
  const backend = useMemo(
    () => new HostedBackend(activeDocumentId),
    [activeDocumentId],
  );
  const [documents, setDocuments] = useState<HostedDocumentListItem[]>([]);
  const [documentPage, setDocumentPage] = useState<HostedPage | null>(null);
  const [viewer, setViewer] = useState<HostedViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState>("clean");
  const [forceResetKey, setForceResetKey] = useState<string | null>(null);
  const [editorViewMode, setEditorViewMode] =
    useState<DocumentEditorViewMode>("rich-text");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [pathDialog, setPathDialog] = useState<PathDialogState | null>(null);
  const [confirmationDialog, setConfirmationDialog] =
    useState<ConfirmationDialogState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HostedPage | null>(null);
  const draftRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveStateRef = useRef<DocumentSaveState>("saved");
  const loadSequenceRef = useRef(0);

  const applyDocument = useCallback((next: HostedPage) => {
    pageRef.current = next;
    draftRef.current = next.content;
    dirtyRef.current = false;
    saveStateRef.current = "saved";
    setDocumentPage(next);
    setConflictState("clean");
  }, []);

  const refreshDocuments = useCallback(async () => {
    const payload = await HostedBackend.list();
    setDocuments(payload.documents);
    setViewer(payload.viewer);
    return payload.documents;
  }, []);

  useEffect(() => {
    const sequence = ++loadSequenceRef.current;
    // Loading is an external API synchronization keyed by the selected
    // document; stale completions are discarded with the sequence guard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([backend.load(), refreshDocuments()])
      .then(([payload]) => {
        if (sequence !== loadSequenceRef.current) return;
        setViewer(payload.viewer);
        applyDocument(payload.document);
      })
      .catch((error: unknown) => {
        if (sequence !== loadSequenceRef.current) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load the hosted document.",
        );
      })
      .finally(() => {
        if (sequence === loadSequenceRef.current) setLoading(false);
      });
  }, [applyDocument, backend, refreshDocuments]);

  const saveDocument = useCallback(
    async (_id: string, content: string) => {
      const current = pageRef.current;
      if (!current) return;
      try {
        const saved = await backend.saveMarkdownFile(
          current.path,
          content,
          current.version,
        );
        applyDocument(saved);
        void refreshDocuments();
      } catch (error) {
        if (error instanceof MarkdownFileConflictError) {
          setConflictState("conflict");
        }
        throw error;
      }
    },
    [applyDocument, backend, refreshDocuments],
  );

  const reloadLatest = useCallback(async () => {
    const current = pageRef.current;
    if (!current) return;
    const latest = await backend.getMarkdownFile(current.path);
    applyDocument(latest);
    setForceResetKey(`${activeDocumentId}:${latest.version}:reload`);
    void refreshDocuments();
  }, [activeDocumentId, applyDocument, backend, refreshDocuments]);

  const replaceHostedRecord = useCallback(async () => {
    const current = pageRef.current;
    if (!current) return;
    const saved = await backend.confirmedReplaceMarkdown(
      draftRef.current ?? current.content,
      current.version,
    );
    applyDocument(saved);
    setForceResetKey(`${activeDocumentId}:${saved.version}:overwrite`);
    void refreshDocuments();
  }, [activeDocumentId, applyDocument, backend, refreshDocuments]);

  const completeReview = useCallback(
    async (options?: CompleteReviewOptions) => {
      const current = pageRef.current;
      if (!current) return { delivered: false };
      const draft = draftRef.current ?? current.content;
      const saved =
        draft === current.content
          ? current
          : await backend.saveMarkdownFile(
              current.path,
              draft,
              current.version,
            );
      if (saved !== current) applyDocument(saved);
      const result = await backend.completeReview(current.path, options);
      const reviewed = await backend.getMarkdownFile(current.path);
      applyDocument(reviewed);
      setForceResetKey(`${activeDocumentId}:${reviewed.version}:reviewed`);
      void refreshDocuments();
      return result;
    },
    [activeDocumentId, applyDocument, backend, refreshDocuments],
  );

  useEffect(() => {
    const current = documentPage;
    if (!current) return;
    return backend.watchMarkdownFile(current.path, (event) => {
      if (!event.version || event.version === pageRef.current?.version) return;
      if (
        chooseHostedExternalUpdateAction({
          isDirty: dirtyRef.current,
          saveState: saveStateRef.current,
        }) === "pause"
      ) {
        setConflictState("changed");
        return;
      }
      void reloadLatest();
    });
  }, [backend, documentPage, reloadLatest]);

  const switchDocument = useCallback(
    (documentId: string) => {
      if (documentId === activeDocumentId) return;
      const destination =
        documentId === CANONICAL_DOCUMENT_ID
          ? window.location.pathname
          : `${window.location.pathname}?document=${encodeURIComponent(
              documentId,
            )}`;
      window.history.replaceState({}, "", destination);
      setLoading(true);
      setLoadError(null);
      setDocumentPage(null);
      pageRef.current = null;
      draftRef.current = null;
      dirtyRef.current = false;
      saveStateRef.current = "saved";
      setConflictState("clean");
      setActivity(null);
      setActivityOpen(false);
      setActiveDocumentId(documentId);
    },
    [activeDocumentId],
  );

  const executeDocumentTransition = useCallback(
    async (action: DocumentTransitionAction) => {
      if (action.kind === "switch") {
        switchDocument(action.documentId);
        return;
      }

      const isImport = action.kind === "import";
      setOperationStatus(
        isImport
          ? "Importing as a new hosted document…"
          : "Creating hosted document…",
      );
      try {
        const filename = action.path.split("/").at(-1) ?? "Untitled";
        const heading =
          filename.replace(/\.(?:md|markdown)$/i, "") || "Untitled";
        const created = await HostedBackend.create({
          path: action.path,
          content: isImport ? await action.file.text() : `# ${heading}\n`,
          operation: isImport ? "import" : "create",
        });
        switchDocument(created.id);
        void refreshDocuments();
        setOperationStatus(
          isImport
            ? `Imported ${created.path}. Hosted record is canonical.`
            : `Created ${created.path}`,
        );
      } catch (error) {
        setOperationStatus(
          error instanceof Error
            ? error.message
            : isImport
              ? "Import failed."
              : "Document creation failed.",
        );
      } finally {
        window.setTimeout(() => setOperationStatus(null), 3_000);
      }
    },
    [refreshDocuments, switchDocument],
  );

  const requestDocumentTransition = useCallback(
    (action: DocumentTransitionAction) => {
      if (action.kind === "switch" && action.documentId === activeDocumentId) {
        return;
      }
      const decision = gateHostedDocumentTransition({
        action,
        isDirty: dirtyRef.current,
        saveState: saveStateRef.current,
      });
      if (decision.kind === "confirm-discard") {
        setConfirmationDialog({ kind: "discard", action: decision.action });
        return;
      }
      void executeDocumentTransition(decision.action);
    },
    [activeDocumentId, executeDocumentTransition],
  );

  const submitPathDialog = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!pathDialog) return;
      const path = pathDialog.path.trim();
      if (!path) return;
      const action: DocumentTransitionAction =
        pathDialog.kind === "import"
          ? { kind: "import", path, file: pathDialog.file }
          : { kind: "create", path };
      setPathDialog(null);
      requestDocumentTransition(action);
    },
    [pathDialog, requestDocumentTransition],
  );

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const response = await fetch(
        documentUrl("/api/history", activeDocumentId),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load activity.");
      setActivity((await response.json()) as ActivityPayload);
    } finally {
      setActivityLoading(false);
    }
  }, [activeDocumentId]);

  useEffect(() => {
    if (activityOpen) void Promise.resolve().then(loadActivity);
  }, [activityOpen, loadActivity]);

  const restoreVersion = useCallback(
    async (version: number) => {
      const current = pageRef.current;
      if (!current) return;
      setRestoreStatus(`Restoring version ${version}…`);
      try {
        const response = await fetch(
          documentUrl("/api/history/restore", activeDocumentId),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              version,
              expectedVersion: current.version,
            }),
          },
        );
        const payload = (await response.json()) as {
          document?: HostedPage;
          current?: HostedPage;
          error?: string;
        };
        if (response.status === 409 && payload.current) {
          setConflictState("conflict");
          throw new Error("A collaborator saved a newer version.");
        }
        if (!response.ok || !payload.document) {
          throw new Error(payload.error || "Restore failed.");
        }
        applyDocument(payload.document);
        setForceResetKey(
          `${activeDocumentId}:${payload.document.version}:restore`,
        );
        await Promise.all([loadActivity(), refreshDocuments()]);
        setRestoreStatus(`Version ${version} restored`);
      } catch (error) {
        setRestoreStatus(
          error instanceof Error ? error.message : "Restore failed.",
        );
      } finally {
        window.setTimeout(() => setRestoreStatus(null), 3_000);
      }
    },
    [activeDocumentId, applyDocument, loadActivity, refreshDocuments],
  );

  const confirmDialogAction = useCallback(() => {
    const pending = confirmationDialog;
    if (!pending) return;
    setConfirmationDialog(null);
    if (pending.kind === "discard") {
      void executeDocumentTransition(pending.action);
      return;
    }
    if (pending.kind === "replace") {
      void replaceHostedRecord();
      return;
    }
    void restoreVersion(pending.version);
  }, [
    confirmationDialog,
    executeDocumentTransition,
    replaceHostedRecord,
    restoreVersion,
  ]);

  const manifestItems = useMemo<MarkdownFileSystemProps["items"]>(
    () =>
      documents.map((document) => ({
        kind: "file",
        id: document.id,
        path: document.path,
        size: document.sizeBytes,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        versionNumber: document.versionNumber,
        reviewState: document.reviewState,
      })),
    [documents],
  );

  if (loading && !documentPage) {
    return (
      <main className="hosted-loading">
        <Loader2 aria-hidden="true" />
        <p>Opening the hosted Markdown workspace…</p>
      </main>
    );
  }

  if (loadError || !documentPage || !viewer) {
    return (
      <main className="hosted-error">
        <p className="hosted-kicker">Roughdraft collaboration</p>
        <h1>We couldn’t open the hosted document.</h1>
        <p>{loadError ?? "The hosted document is unavailable."}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="hosted-shell" data-testid="hosted-shell">
      <header className="hosted-bar">
        <div className="hosted-brand">
          <span className="hosted-brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            <strong>Roughdraft community fork</strong>
            <small>Sites-hosted collaboration</small>
          </span>
        </div>

        <div className="hosted-context">
          <span className="hosted-cloud-status">
            <Cloud aria-hidden="true" />
            Hosted record is canonical
          </span>
          <span className="hosted-version">v{documentPage.versionNumber}</span>
          <span className="hosted-viewer">{viewer.displayName}</span>
        </div>

        <div className="hosted-actions">
          <button
            type="button"
            aria-label={navigatorOpen ? "Hide documents" : "Show documents"}
            onClick={() => setNavigatorOpen((open) => !open)}
          >
            {navigatorOpen ? (
              <PanelLeftClose aria-hidden="true" />
            ) : (
              <PanelLeftOpen aria-hidden="true" />
            )}
            Files
          </button>
          <button
            type="button"
            onClick={() =>
              setPathDialog({ kind: "create", path: "drafts/untitled.md" })
            }
          >
            <FilePlus2 aria-hidden="true" />
            New
          </button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                setPathDialog({ kind: "import", path: file.name, file });
              }
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <FileUp aria-hidden="true" />
            Import new
          </button>
          <a
            href={documentUrl("/api/document/export", activeDocumentId)}
            download
          >
            <Download aria-hidden="true" />
            Export
          </a>
          <button
            type="button"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((open) => !open)}
          >
            <History aria-hidden="true" />
            Activity
          </button>
        </div>
      </header>

      <p className="hosted-attribution" data-testid="hosted-attribution">
        Community fork · based on{" "}
        <a
          href="https://github.com/Lex-Inc/roughdraft"
          target="_blank"
          rel="noreferrer"
        >
          Lex Roughdraft
        </a>{" "}
        · MIT licensed · not affiliated with or endorsed by Lex. Export does not
        update a local Mac file.
      </p>

      <div className="hosted-workspace">
        {navigatorOpen ? (
          <MarkdownFileSystem
            items={manifestItems}
            selectedDocumentId={activeDocumentId}
            onFileOpen={(file) =>
              requestDocumentTransition({
                kind: "switch",
                documentId: file.id,
              })
            }
          />
        ) : null}
        <section className="hosted-editor" aria-label="Hosted document editor">
          <DocumentWorkspace
            documentPage={documentPage}
            activeDocumentPath={documentPage.path}
            documentCopyPath={documentPage.path}
            documentFilenameLabel={
              documentPage.path.split("/").at(-1) ?? "document.md"
            }
            documentEditorViewMode={editorViewMode}
            onDocumentEditorViewModeChange={setEditorViewMode}
            onSaveDocument={saveDocument}
            onDocumentSaveStateChange={(next) => {
              saveStateRef.current = next;
            }}
            onDocumentDirtyStateChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
            onDocumentLocalContentChange={(markdown) => {
              draftRef.current = markdown;
            }}
            documentDiskChangeState={conflictState}
            documentForceResetKey={forceResetKey}
            onReloadDocumentFromDisk={reloadLatest}
            onKeepEditingWithoutAutosave={() => setConflictState("paused")}
            onOverwriteDocumentOnDisk={() =>
              setConfirmationDialog({ kind: "replace" })
            }
            onCompleteReview={completeReview}
            backend={backend}
          />
        </section>
      </div>

      {operationStatus ? (
        <p className="hosted-toast" role="status">
          {operationStatus}
        </p>
      ) : null}

      {activityOpen ? (
        <>
          <button
            className="hosted-scrim"
            type="button"
            aria-label="Close activity"
            onClick={() => setActivityOpen(false)}
          />
          <aside className="activity-panel" aria-label="Collaboration activity">
            <div className="activity-heading">
              <div>
                <p>{documentPage.path}</p>
                <h2>Activity</h2>
              </div>
              <button
                type="button"
                aria-label="Close activity"
                onClick={() => setActivityOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <p className="activity-note">
              Activity is scoped to this hosted document. Restores create a new
              version and never erase prior history.
            </p>

            {activityLoading ? (
              <div className="activity-loading">
                <Loader2 aria-hidden="true" />
                Loading activity…
              </div>
            ) : (
              <>
                <section>
                  <h3>
                    <Activity aria-hidden="true" />
                    Completed reviews
                  </h3>
                  {activity?.reviews.length ? (
                    <ol className="activity-list">
                      {activity.reviews.map((review) => (
                        <li key={review.id}>
                          <span className="activity-dot activity-dot-review" />
                          <div>
                            <strong>{review.reviewerName}</strong>
                            <p>Completed review on version {review.version}</p>
                            {review.overallComment ? (
                              <blockquote>{review.overallComment}</blockquote>
                            ) : null}
                            <time dateTime={review.createdAt}>
                              {formatTimestamp(review.createdAt)}
                            </time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="activity-empty">No completed reviews yet.</p>
                  )}
                </section>

                <section>
                  <h3>
                    <History aria-hidden="true" />
                    Version history
                  </h3>
                  <ol className="activity-list">
                    {activity?.versions.map((version) => (
                      <li key={version.version}>
                        <span className="activity-dot" />
                        <div>
                          <div className="activity-version-row">
                            <strong>Version {version.version}</strong>
                            {version.version !== documentPage.versionNumber ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmationDialog({
                                    kind: "restore",
                                    version: version.version,
                                    path: documentPage.path,
                                  })
                                }
                              >
                                <RotateCcw aria-hidden="true" />
                                Restore
                              </button>
                            ) : (
                              <span>Current</span>
                            )}
                          </div>
                          <p>
                            {capitalize(version.changeKind)} by{" "}
                            {version.authorName}
                          </p>
                          <time dateTime={version.createdAt}>
                            {formatTimestamp(version.createdAt)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}
            {restoreStatus ? (
              <p className="activity-status" role="status">
                {restoreStatus}
              </p>
            ) : null}
            <footer>
              Hosted edits do not synchronize to a Mac-local file. Export
              Markdown for an explicit handoff.
            </footer>
          </aside>
        </>
      ) : null}

      <Dialog
        open={pathDialog !== null}
        onOpenChange={(open) => {
          if (!open) setPathDialog(null);
        }}
      >
        <DialogContent data-testid="hosted-path-dialog">
          <form className="grid gap-4" onSubmit={submitPathDialog}>
            <DialogHeader>
              <DialogTitle>
                {pathDialog?.kind === "import"
                  ? "Import as a new document"
                  : "Create a hosted document"}
              </DialogTitle>
              <DialogDescription>
                Choose a relative Markdown path. Folders are derived from the
                path and no Mac-local file will be changed.
              </DialogDescription>
            </DialogHeader>
            <label
              className="grid gap-1.5 text-sm font-medium text-stone-800"
              htmlFor="hosted-virtual-path"
            >
              Virtual Markdown path
              <Input
                id="hosted-virtual-path"
                data-testid="hosted-path-input"
                autoFocus
                required
                spellCheck={false}
                value={pathDialog?.path ?? ""}
                onChange={(event) =>
                  setPathDialog((current) =>
                    current
                      ? { ...current, path: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setPathDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-9 px-3 text-sm"
                data-testid="hosted-path-submit"
              >
                {pathDialog?.kind === "import" ? "Continue import" : "Continue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmationDialog !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmationDialog(null);
        }}
      >
        <DialogContent data-testid="hosted-confirmation-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirmationDialog
                ? confirmationDialogCopy(confirmationDialog).title
                : "Confirm action"}
            </DialogTitle>
            <DialogDescription>
              {confirmationDialog
                ? confirmationDialogCopy(confirmationDialog).description
                : "Review this action before continuing."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3 text-sm"
              onClick={() => setConfirmationDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 px-3 text-sm"
              data-testid="hosted-confirmation-submit"
              onClick={confirmDialogAction}
            >
              {confirmationDialog
                ? confirmationDialogCopy(confirmationDialog).actionLabel
                : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function confirmationDialogCopy(state: ConfirmationDialogState): {
  title: string;
  description: string;
  actionLabel: string;
} {
  if (state.kind === "replace") {
    return {
      title: "Replace the hosted record?",
      description:
        "Your paused draft will replace the latest hosted record. The replaced version will remain in this document’s history.",
      actionLabel: "Replace hosted record",
    };
  }
  if (state.kind === "restore") {
    return {
      title: `Restore version ${state.version}?`,
      description: `Version ${state.version} will become a new version of ${state.path}. Current history will be retained.`,
      actionLabel: "Restore version",
    };
  }

  const target = state.action;
  const targetLabel =
    target.kind === "switch"
      ? "Switch document"
      : target.kind === "import"
        ? "Import and switch"
        : "Create and switch";
  return {
    title: "Discard the browser draft?",
    description:
      "Continuing will discard the unsaved draft in this browser. The current hosted record will not be changed.",
    actionLabel: targetLabel,
  };
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : "Edit";
}
