import { afterEach, describe, expect, it, vi } from "vitest";
import { HostedBackend } from "./hosted-backend";
import { MarkdownFileConflictError } from "./storage";

const documentDto = (version = "d1:1") => ({
  id: "roughdraft-skill",
  content: "# Roughdraft\n",
  version,
  versionNumber: Number(version.split(":")[1]),
  reviewState: "in_review",
  updatedAt: "2026-07-23T00:00:00.000Z",
  path: "roughdraft-SKILL.md",
});

describe("HostedBackend", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads the shared document and viewer", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        document: documentDto(),
        viewer: {
          displayName: "Reviewer",
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = new HostedBackend();
    const loaded = await backend.load();

    expect(loaded.document.version).toBe("d1:1");
    expect(loaded.document.title).toBe("roughdraft-SKILL.md");
    expect(loaded.viewer.displayName).toBe("Reviewer");
    expect(loaded.viewer).not.toHaveProperty("email");
    expect(backend.info).toMatchObject({
      kind: "sites-hosted",
      canonical: "hosted-record",
      localFileSync: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/document?document=roughdraft-skill",
      { cache: "no-store" },
    );
  });

  it("saves with an optimistic expected version", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/document?document=second-document");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        content: "# Updated\n",
        expectedVersion: "d1:1",
      });
      return Response.json({ document: documentDto("d1:2") });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = new HostedBackend("second-document");
    const saved = await backend.saveMarkdownFile(
      "roughdraft-SKILL.md",
      "# Updated\n",
      "d1:1",
    );

    expect(saved.version).toBe("d1:2");
  });

  it("surfaces a stale save as a conflict with current state", async () => {
    global.fetch = vi.fn(async () =>
      Response.json(
        { error: "Shared document changed.", current: documentDto("d1:3") },
        { status: 409 },
      ),
    ) as unknown as typeof fetch;

    const backend = new HostedBackend();
    await expect(
      backend.saveMarkdownFile("roughdraft-SKILL.md", "# Stale\n", "d1:1"),
    ).rejects.toBeInstanceOf(MarkdownFileConflictError);
  });

  it("makes a confirmed replace explicit and auditable", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        content: "# Reviewer draft\n",
        expectedVersion: "d1:1",
        changeKind: "confirmed-replace",
        confirmedReplace: true,
      });
      return Response.json({ document: documentDto("d1:3") });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = new HostedBackend();
    const saved = await backend.confirmedReplaceMarkdown(
      "# Reviewer draft\n",
      "d1:1",
    );
    expect(saved.version).toBe("d1:3");
  });

  it("records Done Reviewing as a hosted event", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { delivered: true, document: documentDto("d1:2") },
        { status: 201 },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = new HostedBackend();
    const result = await backend.completeReview("roughdraft-SKILL.md", {
      overallComment: "Ready for Codex.",
    });

    expect(result).toEqual({ delivered: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/review-events?document=roughdraft-skill",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps hosted assets to document-scoped private API URLs", () => {
    const backend = new HostedBackend("second-document");
    expect(backend.resolveFileUrl("./.roughdraft-assets/asset-image.png")).toBe(
      "/api/assets?document=second-document&path=.%2F.roughdraft-assets%2Fasset-image.png",
    );
    expect(backend.resolveFileUrl("https://example.com/image.png")).toBeNull();
  });

  it("lists and creates hosted documents through explicit collection APIs", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/documents" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          path: "briefs/new.md",
          content: "# New\n",
          operation: "create",
        });
        return Response.json(
          {
            document: {
              ...documentDto(),
              id: "new-document",
              path: "briefs/new.md",
            },
          },
          { status: 201 },
        );
      }
      return Response.json({
        documents: [
          {
            id: "roughdraft-skill",
            path: "roughdraft-SKILL.md",
            versionNumber: 1,
            reviewState: "in_review",
            createdAt: "2026-07-23T00:00:00.000Z",
            updatedAt: "2026-07-23T00:00:00.000Z",
            sizeBytes: 10,
          },
        ],
        viewer: { displayName: "Reviewer" },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const listed = await HostedBackend.list();
    const created = await HostedBackend.create({
      path: "briefs/new.md",
      content: "# New\n",
      operation: "create",
    });

    expect(listed.documents).toHaveLength(1);
    expect(created).toMatchObject({
      id: "new-document",
      path: "briefs/new.md",
      title: "new.md",
    });
  });
});
