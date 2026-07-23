import { HostedDocumentError } from "./hosted-documents";

export function hostedErrorResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  if (error instanceof HostedDocumentError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details && typeof error.details === "object"
          ? error.details
          : {}),
      },
      { status: error.status },
    );
  }
  return Response.json(
    { error: "Unexpected hosted collaboration error." },
    { status: 500 },
  );
}
