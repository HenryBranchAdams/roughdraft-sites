import {
  type BackendInfo,
  type CompleteReviewOptions,
  type CompleteReviewResult,
  type MarkdownFileChangeEvent,
  MarkdownFileConflictError,
  type Page,
  type ReviewWatchStatus,
  type StorageBackend,
  type StoredAsset,
} from "./storage";

type HostedDocumentDto = {
  id: string;
  content: string;
  version: string;
  versionNumber: number;
  reviewState: string;
  updatedAt: string;
  path: string;
};

export type HostedPage = Page &
  Omit<HostedDocumentDto, "id" | "content" | "version"> & {
    version: string;
  };

export type HostedViewer = {
  displayName: string;
};

const HOSTED_DOCUMENT_TITLE = "Roughdraft shared document";

function hostedPage(document: HostedDocumentDto): HostedPage {
  return {
    ...document,
    title: HOSTED_DOCUMENT_TITLE,
  };
}

export class HostedBackend implements StorageBackend {
  info: BackendInfo = {
    kind: "sites-hosted",
    label: "Sites-hosted collaboration",
    detail: "The hosted D1 record is canonical",
    canonical: "hosted-record",
    localFileSync: false,
  };
  canManageProjects = false;
  private lastVersion: string | null = null;

  async load(): Promise<{ document: HostedPage; viewer: HostedViewer }> {
    const response = await fetch("/api/document", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load hosted document: ${response.status}`);
    }
    const payload = (await response.json()) as {
      document: HostedDocumentDto;
      viewer: HostedViewer;
    };
    this.lastVersion = payload.document.version ?? null;
    return { document: hostedPage(payload.document), viewer: payload.viewer };
  }

  async getMarkdownFile(_relativePath: string): Promise<HostedPage> {
    return (await this.load()).document;
  }

  async saveMarkdownFile(
    _relativePath: string,
    content: string,
    expectedVersion?: string,
  ): Promise<HostedPage> {
    const response = await fetch("/api/document", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, expectedVersion }),
    });
    const payload = (await response.json()) as {
      document?: HostedDocumentDto;
      current?: HostedDocumentDto;
      error?: string;
    };

    if (response.status === 409 && payload.current) {
      this.lastVersion = payload.current.version ?? null;
      throw new MarkdownFileConflictError(hostedPage(payload.current));
    }
    if (!response.ok || !payload.document) {
      throw new Error(payload.error || `Save failed: ${response.status}`);
    }

    this.lastVersion = payload.document.version ?? null;
    return hostedPage(payload.document);
  }

  async importMarkdown(
    content: string,
    expectedVersion?: string,
  ): Promise<HostedPage> {
    const response = await fetch("/api/document", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        expectedVersion,
        changeKind: "import",
      }),
    });
    const payload = (await response.json()) as {
      document?: HostedDocumentDto;
      current?: HostedDocumentDto;
      error?: string;
    };
    if (response.status === 409 && payload.current) {
      throw new MarkdownFileConflictError(hostedPage(payload.current));
    }
    if (!response.ok || !payload.document) {
      throw new Error(payload.error || `Import failed: ${response.status}`);
    }
    this.lastVersion = payload.document.version ?? null;
    return hostedPage(payload.document);
  }

  async confirmedReplaceMarkdown(
    content: string,
    replacedBaseVersion: string,
  ): Promise<HostedPage> {
    const response = await fetch("/api/document", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        expectedVersion: replacedBaseVersion,
        changeKind: "confirmed-replace",
        confirmedReplace: true,
      }),
    });
    const payload = (await response.json()) as {
      document?: HostedDocumentDto;
      error?: string;
    };
    if (!response.ok || !payload.document) {
      throw new Error(
        payload.error || `Confirmed replace failed: ${response.status}`,
      );
    }
    this.lastVersion = payload.document.version ?? null;
    return hostedPage(payload.document);
  }

  watchMarkdownFile(
    relativePath: string,
    onChange: (event: MarkdownFileChangeEvent) => void,
  ): () => void {
    let stopped = false;
    let polling = false;

    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const response = await fetch("/api/document", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          document: HostedDocumentDto;
        };
        const nextVersion = payload.document.version ?? null;
        if (this.lastVersion && nextVersion !== this.lastVersion) {
          onChange({
            path: relativePath,
            exists: true,
            version: nextVersion,
          });
        }
      } catch {
        // A transient poll failure should not interrupt editing.
      } finally {
        polling = false;
      }
    };

    const interval = window.setInterval(() => void poll(), 4_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }

  async completeReview(
    _relativePath: string,
    options: CompleteReviewOptions = {},
  ): Promise<CompleteReviewResult> {
    const response = await fetch("/api/review-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: this.lastVersion,
        overallComment: options.overallComment,
      }),
    });
    const payload = (await response.json()) as {
      delivered?: boolean;
      document?: HostedDocumentDto;
      current?: HostedDocumentDto;
      error?: string;
    };
    if (response.status === 409 && payload.current) {
      throw new MarkdownFileConflictError(hostedPage(payload.current));
    }
    if (!response.ok) {
      throw new Error(
        payload.error || `Review save failed: ${response.status}`,
      );
    }
    if (payload.document) {
      this.lastVersion = payload.document.version ?? null;
    }
    return { delivered: payload.delivered === true };
  }

  async getReviewWatchStatus(
    _relativePath: string,
  ): Promise<ReviewWatchStatus> {
    return { watching: true, watcherCount: 1 };
  }

  async saveAsset(file: File): Promise<StoredAsset> {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/assets", { method: "POST", body });
    const payload = (await response.json()) as StoredAsset & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || `Asset save failed: ${response.status}`);
    }
    return payload;
  }

  resolveFileUrl(path: string): string | null {
    if (!path.startsWith("./.roughdraft-assets/")) return null;
    return `/api/assets?path=${encodeURIComponent(path)}`;
  }

  async openProject(_path: string): Promise<void> {
    // The hosted workspace is intentionally bound to one canonical document.
  }
}
