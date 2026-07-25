"use client";

/**
 * Markdown-only adaptation of Extend UI's File System (Finder), pinned to
 * extend-hq/ui commit 7d7c8ec. The original is Copyright (c) 2026 CrowdView
 * Inc, dba Extend, with portions Copyright (c) 2023 shadcn, under the MIT
 * License. This adaptation retains the flat manifest, derived folders,
 * Finder-style views, search/sort, keyboard navigation, and onFileOpen seam
 * while intentionally omitting heavyweight PDF and Office viewers.
 */
import {
  ChevronLeft,
  Columns3,
  FileText,
  Folder,
  Grid2X2,
  Images,
  List,
  Search,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  deriveMarkdownManifest,
  displayName,
  folderEntries,
  type MarkdownManifestEntry,
  type MarkdownManifestFile,
  type MarkdownSort,
  navigatorTabIndex,
  nextSelectionIndex,
  sortMarkdownEntries,
  visibleMarkdownFiles,
  visibleMarkdownFilesAtPath,
} from "./file-system-model";

export type MarkdownFileSystemView = "icons" | "list" | "columns" | "gallery";

export type MarkdownFileSystemProps = {
  items: MarkdownManifestFile[];
  selectedDocumentId: string;
  onFileOpen: (file: MarkdownManifestFile) => void;
};

const views: Array<{
  value: MarkdownFileSystemView;
  label: string;
  icon: typeof Grid2X2;
}> = [
  { value: "icons", label: "Icons", icon: Grid2X2 },
  { value: "list", label: "List", icon: List },
  { value: "columns", label: "Columns", icon: Columns3 },
  { value: "gallery", label: "Gallery", icon: Images },
];

export function MarkdownFileSystem({
  items,
  selectedDocumentId,
  onFileOpen,
}: MarkdownFileSystemProps) {
  const [view, setView] = useState<MarkdownFileSystemView>("list");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MarkdownSort>("name");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const manifest = useMemo(() => deriveMarkdownManifest(items), [items]);
  const filteredFiles = useMemo(
    () => visibleMarkdownFiles(items, query, sort),
    [items, query, sort],
  );
  const galleryFiles = useMemo(
    () => visibleMarkdownFilesAtPath(items, currentPath, query, sort),
    [currentPath, items, query, sort],
  );
  const currentEntries = useMemo(() => {
    if (query) return filteredFiles;
    return sortMarkdownEntries(folderEntries(manifest, currentPath), sort);
  }, [currentPath, filteredFiles, manifest, query, sort]);
  const selectedFile =
    galleryFiles.find((item) => item.path === selectedPath) ??
    galleryFiles.find((item) => item.id === selectedDocumentId) ??
    galleryFiles[0] ??
    null;

  function selectPath(path: string) {
    setSelectedPath(path);
    viewportRef.current?.focus({ preventScroll: true });
  }

  function openEntry(entry: MarkdownManifestEntry) {
    selectPath(entry.path);
    if (entry.kind === "folder") {
      setCurrentPath(entry.path);
      setQuery("");
      return;
    }
    onFileOpen(entry);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      ![
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "Home",
        "End",
        "Enter",
      ].includes(event.key)
    ) {
      return;
    }
    const entries = view === "gallery" ? galleryFiles : currentEntries;
    const activePath = selectedPath ?? selectedFile?.path ?? null;
    const currentIndex = entries.findIndex(
      (entry) => entry.path === activePath,
    );
    if (event.key === "Enter") {
      const entry = entries[Math.max(0, currentIndex)];
      if (entry) openEntry(entry);
      event.preventDefault();
      return;
    }
    const nextIndex = nextSelectionIndex({
      currentIndex,
      itemCount: entries.length,
      key: event.key,
      columnCount: view === "icons" ? 3 : 1,
    });
    const next = entries[nextIndex];
    if (next) setSelectedPath(next.path);
    event.preventDefault();
  }

  return (
    <aside className="markdown-finder" aria-label="Hosted documents">
      <div className="markdown-finder-toolbar">
        <div className="markdown-finder-title-row">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Enclosing folder"
            disabled={!currentPath}
            onClick={() => {
              const parent = currentPath
                .slice(0, -1)
                .split("/")
                .slice(0, -1)
                .join("/");
              setCurrentPath(parent ? `${parent}/` : "");
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <strong>{currentPath || "Documents"}</strong>
          <span>{items.length}</span>
        </div>
        <div className="markdown-finder-controls">
          <div
            className="markdown-finder-view-tabs"
            role="group"
            aria-label="View"
          >
            {views.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={view === value ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label={`${label} view`}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                <Icon aria-hidden="true" />
              </Button>
            ))}
          </div>
          <select
            className="markdown-finder-view-select"
            aria-label="View"
            value={view}
            onChange={(event) =>
              setView(event.target.value as MarkdownFileSystemView)
            }
          >
            {views.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="markdown-finder-sort"
            aria-label="Sort documents"
            value={sort}
            onChange={(event) => setSort(event.target.value as MarkdownSort)}
          >
            <option value="name">Name</option>
            <option value="updated">Modified</option>
          </select>
        </div>
        <label className="markdown-finder-search" htmlFor="document-search">
          <Search aria-hidden="true" />
          <Input
            id="document-search"
            type="search"
            aria-label="Search documents"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div
        ref={viewportRef}
        className={`markdown-finder-viewport markdown-finder-${view}`}
        role="application"
        aria-label="Document browser"
        tabIndex={navigatorTabIndex("viewport")}
        onKeyDown={handleKeyDown}
      >
        {currentEntries.length === 0 ? (
          <p className="markdown-finder-empty">
            {query ? "No matching Markdown documents" : "This folder is empty"}
          </p>
        ) : view === "gallery" ? (
          <GalleryView
            files={galleryFiles}
            selected={selectedFile}
            onSelect={selectPath}
            onOpen={onFileOpen}
          />
        ) : view === "columns" ? (
          <ColumnsView
            entries={currentEntries}
            selectedPath={selectedPath ?? selectedFile?.path ?? null}
            onSelect={selectPath}
            onOpen={openEntry}
          />
        ) : (
          <EntryCollection
            entries={view === "list" && query ? filteredFiles : currentEntries}
            view={view}
            selectedPath={selectedPath ?? selectedFile?.path ?? null}
            selectedDocumentId={selectedDocumentId}
            onSelect={selectPath}
            onOpen={openEntry}
          />
        )}
      </div>
    </aside>
  );
}

function EntryCollection({
  entries,
  view,
  selectedPath,
  selectedDocumentId,
  onSelect,
  onOpen,
}: {
  entries: MarkdownManifestEntry[];
  view: "icons" | "list";
  selectedPath: string | null;
  selectedDocumentId: string;
  onSelect: (path: string) => void;
  onOpen: (entry: MarkdownManifestEntry) => void;
}) {
  return (
    <div className="markdown-finder-entry-collection" role="listbox">
      {entries.map((entry) => {
        const selected =
          entry.path === selectedPath ||
          (entry.kind === "file" && entry.id === selectedDocumentId);
        return (
          <button
            key={`${entry.kind}:${entry.path}`}
            type="button"
            className="markdown-finder-entry"
            role="option"
            tabIndex={navigatorTabIndex("item")}
            aria-selected={selected}
            data-kind={entry.kind}
            onClick={() => onSelect(entry.path)}
            onDoubleClick={() => onOpen(entry)}
          >
            {entry.kind === "folder" ? (
              <Folder aria-hidden="true" />
            ) : (
              <FileText aria-hidden="true" />
            )}
            <span>{displayName(entry.path)}</span>
            {view === "list" && entry.kind === "file" ? (
              <>
                <small>{formatDate(entry.updatedAt)}</small>
                <small>{formatBytes(entry.size)}</small>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ColumnsView({
  entries,
  selectedPath,
  onSelect,
  onOpen,
}: {
  entries: MarkdownManifestEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onOpen: (entry: MarkdownManifestEntry) => void;
}) {
  const selected = entries.find((entry) => entry.path === selectedPath) ?? null;
  return (
    <div className="markdown-finder-columns-layout">
      <div className="markdown-finder-column">
        {entries.map((entry) => (
          <button
            key={`${entry.kind}:${entry.path}`}
            type="button"
            tabIndex={navigatorTabIndex("item")}
            aria-pressed={entry.path === selectedPath}
            onClick={() => onSelect(entry.path)}
            onDoubleClick={() => onOpen(entry)}
          >
            {entry.kind === "folder" ? (
              <Folder aria-hidden="true" />
            ) : (
              <FileText aria-hidden="true" />
            )}
            {displayName(entry.path)}
          </button>
        ))}
      </div>
      <div className="markdown-finder-preview">
        {selected?.kind === "file" ? (
          <>
            <FileText aria-hidden="true" />
            <strong>{displayName(selected.path)}</strong>
            <span>{selected.path}</span>
            <span>{formatBytes(selected.size)}</span>
            <Button
              tabIndex={navigatorTabIndex("item")}
              onClick={() => onOpen(selected)}
            >
              Open
            </Button>
          </>
        ) : (
          <span>Select a Markdown document</span>
        )}
      </div>
    </div>
  );
}

function GalleryView({
  files,
  selected,
  onSelect,
  onOpen,
}: {
  files: MarkdownManifestFile[];
  selected: MarkdownManifestFile | null;
  onSelect: (path: string) => void;
  onOpen: (file: MarkdownManifestFile) => void;
}) {
  return (
    <div className="markdown-finder-gallery-layout">
      <div className="markdown-finder-gallery-stage">
        <FileText aria-hidden="true" />
        {selected ? (
          <>
            <strong>{displayName(selected.path)}</strong>
            <span>{selected.path}</span>
            <Button
              tabIndex={navigatorTabIndex("item")}
              onClick={() => onOpen(selected)}
            >
              Open Markdown
            </Button>
          </>
        ) : null}
      </div>
      <div className="markdown-finder-filmstrip">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            tabIndex={navigatorTabIndex("item")}
            aria-pressed={file.path === selected?.path}
            onClick={() => onSelect(file.path)}
            onDoubleClick={() => onOpen(file)}
          >
            <FileText aria-hidden="true" />
            <span>{displayName(file.path)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatBytes(value: number): string {
  if (value < 1_000) return `${value} B`;
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} KB`;
}
