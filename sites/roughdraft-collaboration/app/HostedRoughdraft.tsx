"use client";

import {
  Activity,
  Cloud,
  Download,
  FileUp,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentEditorViewMode } from "./roughdraft-ui/app-navigation";
import { DocumentWorkspace } from "./roughdraft-ui/DocumentWorkspace";
import {
  HostedBackend,
  type HostedPage,
  type HostedViewer,
} from "./roughdraft-ui/hosted-backend";
import { chooseHostedExternalUpdateAction } from "./roughdraft-ui/hosted-sync-policy";
import type { DocumentSaveState } from "./roughdraft-ui/PageCard";
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

const DOCUMENT_PATH = "roughdraft-SKILL.md";

export default function HostedRoughdraft() {
  const [backend] = useState(() => new HostedBackend());
  const [documentPage, setDocumentPage] = useState<HostedPage | null>(null);
  const [viewer, setViewer] = useState<HostedViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<DocumentSaveState>("saved");
  const [documentDirty, setDocumentDirty] = useState(false);
  const [conflictState, setConflictState] = useState<ConflictState>("clean");
  const [forceResetKey, setForceResetKey] = useState<string | null>(null);
  const [editorViewMode, setEditorViewMode] =
    useState<DocumentEditorViewMode>("rich-text");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HostedPage | null>(null);
  const draftRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveStateRef = useRef<DocumentSaveState>("saved");

  const applyDocument = useCallback((next: HostedPage) => {
    pageRef.current = next;
    draftRef.current = next.content;
    dirtyRef.current = false;
    setDocumentDirty(false);
    setDocumentPage(next);
    setConflictState("clean");
  }, []);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await backend.load();
      setViewer(payload.viewer);
      applyDocument(payload.document);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load the hosted document.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyDocument, backend]);

  useEffect(() => {
    void Promise.resolve().then(loadDocument);
  }, [loadDocument]);

  const saveDocument = useCallback(
    async (_id: string, content: string) => {
      const current = pageRef.current;
      if (!current) return;
      try {
        const saved = await backend.saveMarkdownFile(
          DOCUMENT_PATH,
          content,
          current.version,
        );
        applyDocument(saved);
      } catch (error) {
        if (error instanceof MarkdownFileConflictError) {
          setConflictState("conflict");
        }
        throw error;
      }
    },
    [applyDocument, backend],
  );

  const reloadLatest = useCallback(async () => {
    const latest = await backend.getMarkdownFile(DOCUMENT_PATH);
    applyDocument(latest);
    setForceResetKey(`${latest.version}:reload`);
  }, [applyDocument, backend]);

  const overwriteShared = useCallback(async () => {
    const current = pageRef.current;
    if (!current) return;
    if (
      !window.confirm(
        "Replace the latest hosted record with your paused draft? The replaced version will remain in history.",
      )
    ) {
      return;
    }
    const saved = await backend.confirmedReplaceMarkdown(
      draftRef.current ?? current.content,
      current.version,
    );
    applyDocument(saved);
    saveStateRef.current = "saved";
    setSaveState("saved");
    setForceResetKey(`${saved.version}:overwrite`);
  }, [applyDocument, backend]);

  const completeReview = useCallback(
    async (options?: CompleteReviewOptions) => {
      const current = pageRef.current;
      if (!current) return { delivered: false };

      const draft = draftRef.current ?? current.content;
      const saved =
        draft === current.content
          ? current
          : await backend.saveMarkdownFile(
              DOCUMENT_PATH,
              draft,
              current.version,
            );
      if (saved !== current) applyDocument(saved);
      const result = await backend.completeReview(DOCUMENT_PATH, options);
      const reviewed = await backend.getMarkdownFile(DOCUMENT_PATH);
      applyDocument(reviewed);
      setForceResetKey(`${reviewed.version}:reviewed`);
      return result;
    },
    [applyDocument, backend],
  );

  useEffect(() => {
    if (!documentPage) return;
    return backend.watchMarkdownFile(DOCUMENT_PATH, (event) => {
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

  const importMarkdown = useCallback(
    async (file: File) => {
      const current = pageRef.current;
      if (!current) return;
      setImportStatus("Importing…");
      try {
        const content = await file.text();
        const imported = await backend.importMarkdown(content, current.version);
        applyDocument(imported);
        setForceResetKey(`${imported.version}:import`);
        setImportStatus(`Imported ${file.name}`);
      } catch (error) {
        if (error instanceof MarkdownFileConflictError) {
          setConflictState("conflict");
        }
        setImportStatus(
          error instanceof Error ? error.message : "Import failed.",
        );
      } finally {
        window.setTimeout(() => setImportStatus(null), 3_000);
      }
    },
    [applyDocument, backend],
  );

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load activity.");
      setActivity((await response.json()) as ActivityPayload);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activityOpen) void Promise.resolve().then(loadActivity);
  }, [activityOpen, loadActivity]);

  const restoreVersion = useCallback(
    async (version: number) => {
      const current = pageRef.current;
      if (!current) return;
      if (
        !window.confirm(
          `Restore version ${version} as a new shared version? Your current version will remain in history.`,
        )
      ) {
        return;
      }

      setRestoreStatus(`Restoring version ${version}…`);
      try {
        const response = await fetch("/api/history/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version,
            expectedVersion: current.version,
          }),
        });
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
        setForceResetKey(`${payload.document.version}:restore`);
        await loadActivity();
        setRestoreStatus(`Version ${version} restored`);
      } catch (error) {
        setRestoreStatus(
          error instanceof Error ? error.message : "Restore failed.",
        );
      } finally {
        window.setTimeout(() => setRestoreStatus(null), 3_000);
      }
    },
    [applyDocument, loadActivity],
  );

  if (loading) {
    return (
      <main className="hosted-loading">
        <Loader2 aria-hidden="true" />
        <p>Opening the shared Roughdraft workspace…</p>
      </main>
    );
  }

  if (loadError || !documentPage || !viewer) {
    return (
      <main className="hosted-error">
        <p className="hosted-kicker">Roughdraft collaboration</p>
        <h1>We couldn’t open the shared document.</h1>
        <p>{loadError ?? "The hosted document is unavailable."}</p>
        <button type="button" onClick={() => void loadDocument()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="hosted-shell">
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
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importMarkdown(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={documentDirty || saveState !== "saved"}
          >
            <FileUp aria-hidden="true" />
            Import
          </button>
          <a href="/api/document/export">
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

      <p className="hosted-attribution">
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

      <section className="hosted-editor" aria-label="Shared document editor">
        <DocumentWorkspace
          documentPage={documentPage}
          activeDocumentPath={DOCUMENT_PATH}
          documentCopyPath={DOCUMENT_PATH}
          documentFilenameLabel={DOCUMENT_PATH}
          documentEditorViewMode={editorViewMode}
          onDocumentEditorViewModeChange={setEditorViewMode}
          onSaveDocument={saveDocument}
          onDocumentSaveStateChange={(next) => {
            saveStateRef.current = next;
            setSaveState(next);
          }}
          onDocumentDirtyStateChange={(dirty) => {
            dirtyRef.current = dirty;
            setDocumentDirty(dirty);
          }}
          onDocumentLocalContentChange={(markdown) => {
            draftRef.current = markdown;
          }}
          documentDiskChangeState={conflictState}
          documentForceResetKey={forceResetKey}
          onReloadDocumentFromDisk={reloadLatest}
          onKeepEditingWithoutAutosave={() => setConflictState("paused")}
          onOverwriteDocumentOnDisk={overwriteShared}
          onCompleteReview={completeReview}
          backend={backend}
        />
      </section>

      {importStatus ? (
        <p className="hosted-toast" role="status">
          {importStatus}
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
                <p>Shared workspace</p>
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
              Every import, edit, restore, and completed review remains
              attributable. Restores create a new version; they never erase
              history.
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
                                  void restoreVersion(version.version)
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
              Markdown for a manual handoff until the optional local bridge is
              added.
            </footer>
          </aside>
        </>
      ) : null}
    </main>
  );
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
