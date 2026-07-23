export type HostedSaveState = "saved" | "unsaved" | "saving" | "error";

export function shouldPersistRichTextUpdate(input: {
  editorFocused: boolean;
}): boolean {
  return input.editorFocused;
}

export function chooseHostedExternalUpdateAction(input: {
  isDirty: boolean;
  saveState: HostedSaveState;
}): "reload" | "pause" {
  return input.isDirty || input.saveState !== "saved" ? "pause" : "reload";
}
