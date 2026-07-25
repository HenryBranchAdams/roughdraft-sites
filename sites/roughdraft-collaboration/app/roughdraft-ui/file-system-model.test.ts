import { describe, expect, it } from "vitest";
import {
  deriveMarkdownManifest,
  folderEntries,
  navigatorTabIndex,
  nextSelectionIndex,
  sortMarkdownEntries,
  visibleMarkdownFiles,
  visibleMarkdownFilesAtPath,
  type MarkdownManifestFile,
} from "./file-system-model";

const files: MarkdownManifestFile[] = [
  {
    kind: "file",
    id: "one",
    path: "briefs/alpha.md",
    size: 10,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    versionNumber: 1,
    reviewState: "in_review",
  },
  {
    kind: "file",
    id: "two",
    path: "briefs/2026/beta.markdown",
    size: 20,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    versionNumber: 2,
    reviewState: "reviewed",
  },
];

describe("Markdown file-system model", () => {
  it("derives a hierarchy from a flat hosted manifest", () => {
    const manifest = deriveMarkdownManifest(files);
    expect(manifest.filter((entry) => entry.kind === "folder")).toMatchObject([
      { path: "briefs/", parentPath: "" },
      { path: "briefs/2026/", parentPath: "briefs/" },
    ]);
    expect(
      folderEntries(manifest, "briefs/").map((entry) => entry.path),
    ).toEqual(["briefs/2026/", "briefs/alpha.md"]);
  });

  it("searches paths and sorts by modified time deterministically", () => {
    expect(visibleMarkdownFiles(files, "BETA", "updated")).toEqual([files[1]]);
    expect(
      visibleMarkdownFiles(files, "", "updated").map((file) => file.id),
    ).toEqual(["two", "one"]);
  });

  it("applies modified sorting to files inside a folder after folders", () => {
    const rootFiles: MarkdownManifestFile[] = [
      files[0],
      {
        ...files[0],
        id: "three",
        path: "briefs/zulu.md",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
    ];
    const entries = [
      ...folderEntries(deriveMarkdownManifest(files), "briefs/").filter(
        (entry) => entry.kind === "folder",
      ),
      ...rootFiles,
    ];
    expect(
      sortMarkdownEntries(entries, "updated").map((entry) => entry.path),
    ).toEqual(["briefs/2026/", "briefs/zulu.md", "briefs/alpha.md"]);
  });

  it("scopes gallery files to the current folder unless search is active", () => {
    expect(
      visibleMarkdownFilesAtPath(files, "briefs/", "", "name").map(
        (file) => file.id,
      ),
    ).toEqual(["one"]);
    expect(
      visibleMarkdownFilesAtPath(files, "briefs/", "beta", "name").map(
        (file) => file.id,
      ),
    ).toEqual(["two"]);
  });

  it("uses the viewport as the navigator's single tab stop", () => {
    expect(navigatorTabIndex("viewport")).toBe(0);
    expect(navigatorTabIndex("item")).toBe(-1);
  });

  it("moves selection predictably for grid and linear keyboard navigation", () => {
    expect(
      nextSelectionIndex({
        currentIndex: 0,
        itemCount: 8,
        key: "ArrowDown",
        columnCount: 3,
      }),
    ).toBe(3);
    expect(
      nextSelectionIndex({
        currentIndex: 7,
        itemCount: 8,
        key: "ArrowRight",
      }),
    ).toBe(7);
    expect(
      nextSelectionIndex({ currentIndex: 3, itemCount: 8, key: "Home" }),
    ).toBe(0);
  });
});
