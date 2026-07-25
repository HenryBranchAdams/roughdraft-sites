import { describe, expect, it } from "vitest";
import {
  HOSTED_VIEWER_FALLBACK,
  readHostedViewerIdentity,
  safeHostedDisplayName,
  toHostedDocumentPublicDto,
  toHostedViewerPublicDto,
} from "./hosted-public-data";

describe("hosted public data", () => {
  it("uses a non-email fallback when the full-name header is missing", () => {
    expect(safeHostedDisplayName(undefined)).toBe(HOSTED_VIEWER_FALLBACK);
    expect(safeHostedDisplayName("reviewer@example.com")).toBe(
      HOSTED_VIEWER_FALLBACK,
    );
    expect(safeHostedDisplayName("  Ada   Lovelace ")).toBe("Ada Lovelace");

    const identity = readHostedViewerIdentity(
      new Request("https://fork.example/review", {
        headers: {
          "oai-authenticated-user-email": "Reviewer@Example.com",
        },
      }),
    );
    expect(identity).toEqual({
      displayName: HOSTED_VIEWER_FALLBACK,
      email: "reviewer@example.com",
    });
  });

  it("publishes only a display name for the viewer", () => {
    const publicViewer = toHostedViewerPublicDto({
      displayName: "Grace Hopper",
    });

    expect(publicViewer).toEqual({ displayName: "Grace Hopper" });
    expect(publicViewer).not.toHaveProperty("email");
  });

  it("omits audit identity and document-derived title from document DTOs", () => {
    const publicDocument = toHostedDocumentPublicDto({
      id: "roughdraft-skill",
      title: "Private document heading",
      content: "# Private document heading\n",
      version: "d1:2",
      versionNumber: 2,
      reviewState: "in_review",
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:01:00.000Z",
      updatedBy: "audit-only@example.test",
      path: "roughdraft-SKILL.md",
      mode: "sites-hosted",
      canonical: "hosted-record",
      schemaVersion: 3,
      accessScope: "site-members",
      capabilities: {
        sharedPersistence: true,
        optimisticConcurrency: true,
        importExport: true,
        localFileSync: false,
      },
    });

    expect(publicDocument).not.toHaveProperty("updatedBy");
    expect(publicDocument).not.toHaveProperty("title");
    expect(JSON.stringify(publicDocument)).not.toContain(
      "audit-only@example.test",
    );
  });
});
