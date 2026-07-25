export const HOSTED_VIEWER_FALLBACK = "Site member";

export type HostedViewerPublicDto = {
  displayName: string;
};

export type HostedViewerIdentity = {
  displayName: string;
  email: string;
};

export type HostedDocumentPublicDto = {
  id: string;
  content: string;
  version: string;
  versionNumber: number;
  reviewState: string;
  createdAt: string;
  updatedAt: string;
  path: string;
  mode: "sites-hosted";
  canonical: "hosted-record";
  schemaVersion: number;
  accessScope: "site-members" | "restricted" | "owner-only";
  capabilities: {
    sharedPersistence: true;
    optimisticConcurrency: true;
    importExport: true;
    localFileSync: false;
  };
};

export type HostedDocumentListItemPublicDto = {
  id: string;
  path: string;
  versionNumber: number;
  reviewState: string;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
};

type HostedViewerPublicSource = {
  displayName: string;
};

type HostedDocumentPublicSource = HostedDocumentPublicDto & {
  title: string;
  updatedBy: string;
};

export function safeHostedDisplayName(
  value: string | null | undefined,
): string {
  const normalized = Array.from(value ?? "", (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.includes("@")) {
    return HOSTED_VIEWER_FALLBACK;
  }
  return normalized.slice(0, 120);
}

export function readHostedViewerIdentity(
  request: Request,
): HostedViewerIdentity | null {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (!email) {
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1"
      ? {
          displayName: "Local preview",
          email: "local-preview@roughdraft.test",
        }
      : null;
  }

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );
  let fullName: string | null = null;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      fullName = decodeURIComponent(encodedName);
    } catch {
      fullName = null;
    }
  }

  return {
    displayName: safeHostedDisplayName(fullName),
    email,
  };
}

export function toHostedViewerPublicDto(
  viewer: HostedViewerPublicSource,
): HostedViewerPublicDto {
  return { displayName: safeHostedDisplayName(viewer.displayName) };
}

export function toHostedDocumentPublicDto(
  document: HostedDocumentPublicSource,
): HostedDocumentPublicDto {
  return {
    id: document.id,
    content: document.content,
    version: document.version,
    versionNumber: document.versionNumber,
    reviewState: document.reviewState,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    path: document.path,
    mode: document.mode,
    canonical: document.canonical,
    schemaVersion: document.schemaVersion,
    accessScope: document.accessScope,
    capabilities: document.capabilities,
  };
}
