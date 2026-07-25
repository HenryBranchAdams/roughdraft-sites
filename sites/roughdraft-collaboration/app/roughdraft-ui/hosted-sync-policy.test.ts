import { describe, expect, it } from "vitest";
import {
  chooseHostedExternalUpdateAction,
  shouldPersistRichTextUpdate,
} from "./hosted-sync-policy";

describe("hosted collaboration synchronization policy", () => {
  it("does not persist unfocused hydration or normalization updates", () => {
    expect(shouldPersistRichTextUpdate({ editorFocused: false })).toBe(false);
  });

  it("persists a genuine focused editor update", () => {
    expect(shouldPersistRichTextUpdate({ editorFocused: true })).toBe(true);
  });

  it("reloads a collaborator version only when the context is clean", () => {
    expect(
      chooseHostedExternalUpdateAction({
        isDirty: false,
        saveState: "saved",
      }),
    ).toBe("reload");
  });

  it("pauses for genuine local edits or an in-flight save", () => {
    expect(
      chooseHostedExternalUpdateAction({
        isDirty: true,
        saveState: "saved",
      }),
    ).toBe("pause");
    expect(
      chooseHostedExternalUpdateAction({
        isDirty: false,
        saveState: "saving",
      }),
    ).toBe("pause");
  });
});
