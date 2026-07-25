import { describe, expect, it } from "vitest";
import { InvalidVirtualPathError, validateVirtualPath } from "./virtual-path";

describe("hosted virtual Markdown paths", () => {
  it("accepts normalized relative Markdown paths", () => {
    expect(validateVirtualPath(" briefs/2026/review.md ")).toBe(
      "briefs/2026/review.md",
    );
    expect(validateVirtualPath("README.markdown")).toBe("README.markdown");
  });

  it.each([
    "",
    "/private/report.md",
    "../report.md",
    "briefs/../../report.md",
    "briefs//report.md",
    ".hidden/report.md",
    "briefs\\report.md",
    "briefs/report.txt",
  ])("rejects unsafe path %j", (path) => {
    expect(() => validateVirtualPath(path)).toThrow(InvalidVirtualPathError);
  });
});
