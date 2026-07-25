const MAX_VIRTUAL_PATH_LENGTH = 240;

export class InvalidVirtualPathError extends Error {
  constructor(
    message: string,
    readonly code = "invalid_virtual_path",
  ) {
    super(message);
    this.name = "InvalidVirtualPathError";
  }
}

export function validateVirtualPath(value: unknown): string {
  if (typeof value !== "string") {
    throw new InvalidVirtualPathError("A Markdown virtual path is required.");
  }
  const path = value.trim();
  const segments = path.split("/");
  const hasControlCharacters = Array.from(path).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    path.length < 1 ||
    path.length > MAX_VIRTUAL_PATH_LENGTH ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    hasControlCharacters ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.length > 100,
    ) ||
    !/\.(?:md|markdown)$/i.test(path)
  ) {
    throw new InvalidVirtualPathError(
      "Use a relative Markdown path without hidden, empty, dot, or parent segments.",
    );
  }
  return path;
}
