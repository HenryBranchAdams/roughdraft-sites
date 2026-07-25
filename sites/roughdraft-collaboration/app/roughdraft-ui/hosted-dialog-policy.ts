import type { DocumentSaveState } from "./PageCard";

export type HostedDocumentTransition<T> =
  | { kind: "execute"; action: T }
  | { kind: "confirm-discard"; action: T };

export function gateHostedDocumentTransition<T>(input: {
  action: T;
  isDirty: boolean;
  saveState: DocumentSaveState;
}): HostedDocumentTransition<T> {
  return input.isDirty || input.saveState !== "saved"
    ? { kind: "confirm-discard", action: input.action }
    : { kind: "execute", action: input.action };
}
