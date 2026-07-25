import { describe, expect, it } from "vitest";
import { gateHostedDocumentTransition } from "./hosted-dialog-policy";

describe("hosted document transition dialogs", () => {
  const actions = [
    { kind: "switch", documentId: "second-document" },
    { kind: "create", path: "drafts/new.md" },
    { kind: "import", path: "imports/brief.md" },
  ] as const;

  it.each(actions)("executes clean $kind transitions immediately", (action) => {
    expect(
      gateHostedDocumentTransition({
        action,
        isDirty: false,
        saveState: "saved",
      }),
    ).toEqual({ kind: "execute", action });
  });

  it.each(
    actions,
  )("preserves a dirty $kind transition until discard is confirmed", (action) => {
    expect(
      gateHostedDocumentTransition({
        action,
        isDirty: true,
        saveState: "unsaved",
      }),
    ).toEqual({ kind: "confirm-discard", action });
  });

  it("also gates a transition while a save is still in flight", () => {
    const action = { kind: "switch", documentId: "second-document" };
    expect(
      gateHostedDocumentTransition({
        action,
        isDirty: false,
        saveState: "saving",
      }),
    ).toEqual({ kind: "confirm-discard", action });
  });
});
