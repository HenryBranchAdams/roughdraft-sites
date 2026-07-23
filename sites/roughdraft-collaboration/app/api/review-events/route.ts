import { hostedErrorResponse } from "../../../lib/api-response";
import {
  completeCanonicalReview,
  HostedDocumentError,
  publicHostedDocument,
  requireDocumentAccess,
  requireSameOriginMutation,
} from "../../../lib/hosted-documents";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOriginMutation(request);
    const { viewer } = await requireDocumentAccess(request, "write");
    const body = (await request.json()) as {
      expectedVersion?: unknown;
      overallComment?: unknown;
    };
    if (typeof body.expectedVersion !== "string") {
      throw new HostedDocumentError(
        "A valid expectedVersion is required.",
        428,
        "expected_version_required",
      );
    }
    const result = await completeCanonicalReview({
      expectedVersion: body.expectedVersion,
      overallComment:
        typeof body.overallComment === "string"
          ? body.overallComment
          : undefined,
      viewer,
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

    return Response.json(
      { delivered: true, document: publicHostedDocument(result) },
      { status: 201 },
    );
  } catch (error) {
    return hostedErrorResponse(error);
  }
}
