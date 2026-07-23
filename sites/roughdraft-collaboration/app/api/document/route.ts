import { hostedErrorResponse } from "../../../lib/api-response";
import {
  HostedDocumentError,
  publicHostedDocument,
  publicHostedViewer,
  requireDocumentAccess,
  requireSameOriginMutation,
  saveCanonicalDocument,
} from "../../../lib/hosted-documents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { viewer, document } = await requireDocumentAccess(request, "read", {
      initializeCanonical: true,
    });
    return Response.json({
      document: publicHostedDocument(document),
      viewer: publicHostedViewer(viewer),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    requireSameOriginMutation(request);
    const { viewer } = await requireDocumentAccess(request, "write");
    const body = (await request.json()) as {
      content?: unknown;
      expectedVersion?: unknown;
      changeKind?: unknown;
      confirmedReplace?: unknown;
    };
    if (typeof body.content !== "string") {
      return Response.json(
        { error: "Markdown content is required." },
        { status: 400 },
      );
    }
    if (typeof body.expectedVersion !== "string") {
      throw new HostedDocumentError(
        "A valid expectedVersion is required.",
        428,
        "expected_version_required",
      );
    }

    const changeKind =
      body.changeKind === "import" || body.changeKind === "restore"
        ? body.changeKind
        : body.changeKind === "confirmed-replace" &&
            body.confirmedReplace === true
          ? "confirmed-replace"
          : "edit";
    const result = await saveCanonicalDocument({
      content: body.content,
      expectedVersion: body.expectedVersion,
      viewer,
      changeKind,
      confirmedReplace:
        changeKind === "confirmed-replace" && body.confirmedReplace === true,
    });

    if ("conflict" in result) {
      return Response.json(
        {
          error: "Shared document changed.",
          current: publicHostedDocument(result.conflict),
        },
        { status: 409 },
      );
    }

    return Response.json({ document: publicHostedDocument(result) });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown): Response {
  return hostedErrorResponse(error);
}
