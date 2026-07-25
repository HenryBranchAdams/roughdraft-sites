export type MarkdownManifestFile = {
  kind: "file";
  id: string;
  path: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  versionNumber: number;
  reviewState: string;
};

export type MarkdownManifestFolder = {
  kind: "folder";
  path: string;
  name: string;
  parentPath: string;
};

export type MarkdownManifestEntry =
  | MarkdownManifestFile
  | MarkdownManifestFolder;

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index + 1);
}

export function displayName(path: string): string {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  return normalized.split("/").at(-1) ?? normalized;
}

export function deriveMarkdownManifest(
  files: readonly MarkdownManifestFile[],
): MarkdownManifestEntry[] {
  const folders = new Map<string, MarkdownManifestFolder>();
  for (const file of files) {
    const segments = file.path.split("/");
    let folderPath = "";
    for (const segment of segments.slice(0, -1)) {
      const nextPath = `${folderPath}${segment}/`;
      if (!folders.has(nextPath)) {
        folders.set(nextPath, {
          kind: "folder",
          path: nextPath,
          name: segment,
          parentPath: folderPath,
        });
      }
      folderPath = nextPath;
    }
  }
  return [...folders.values(), ...files];
}

export function folderEntries(
  manifest: readonly MarkdownManifestEntry[],
  currentPath: string,
): MarkdownManifestEntry[] {
  return manifest.filter((entry) => {
    if (entry.kind === "folder") return entry.parentPath === currentPath;
    return parentPath(entry.path) === currentPath;
  });
}

export type MarkdownSort = "name" | "updated";

export function sortMarkdownEntries(
  entries: readonly MarkdownManifestEntry[],
  sort: MarkdownSort,
): MarkdownManifestEntry[] {
  return entries.toSorted((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    if (sort === "updated" && left.kind === "file" && right.kind === "file") {
      const byDate = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (byDate !== 0) return byDate;
    }
    return displayName(left.path).localeCompare(
      displayName(right.path),
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );
  });
}

export function visibleMarkdownFiles(
  files: readonly MarkdownManifestFile[],
  query: string,
  sort: MarkdownSort,
): MarkdownManifestFile[] {
  const normalized = query.trim().toLocaleLowerCase();
  return files
    .filter(
      (file) =>
        !normalized || file.path.toLocaleLowerCase().includes(normalized),
    )
    .toSorted((left, right) => {
      if (sort === "updated") {
        const byDate = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (byDate !== 0) return byDate;
      }
      return left.path.localeCompare(right.path, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export function visibleMarkdownFilesAtPath(
  files: readonly MarkdownManifestFile[],
  currentPath: string,
  query: string,
  sort: MarkdownSort,
): MarkdownManifestFile[] {
  const visible = visibleMarkdownFiles(files, query, sort);
  return query.trim()
    ? visible
    : visible.filter((file) => parentPath(file.path) === currentPath);
}

export function navigatorTabIndex(target: "viewport" | "item"): 0 | -1 {
  return target === "viewport" ? 0 : -1;
}

export function nextSelectionIndex(input: {
  currentIndex: number;
  itemCount: number;
  key: string;
  columnCount?: number;
}): number {
  const { currentIndex, itemCount, key } = input;
  if (itemCount < 1) return -1;
  const current = Math.max(0, currentIndex);
  const columns = Math.max(1, input.columnCount ?? 1);
  if (key === "ArrowRight") return Math.min(itemCount - 1, current + 1);
  if (key === "ArrowLeft") return Math.max(0, current - 1);
  if (key === "ArrowDown") return Math.min(itemCount - 1, current + columns);
  if (key === "ArrowUp") return Math.max(0, current - columns);
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return currentIndex;
}
