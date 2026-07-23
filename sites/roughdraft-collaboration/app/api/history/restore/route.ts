import { hostedErrorResponse } from "../../../../lib/api-response";
import {
  HostedDocumentError,
  publicHostedDocument,
  requireDocumentAccess,
  requireSameOriginMutation,
  restoreCanonicalVersion,
} from "../../../../lib/hosted-documents";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOriginMutation(request);
    const { viewer } = await requireDocumentAccess(request, "write");
    const body = (await request.json()) as {
      version?: unknown;
      expectedVersion?: unknown;
    };
    if (!Number.isInteger(body.version) || Number(body.version) < 1) {
      return Response.json(
        { error: "A valid version is required." },
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

    const result = await restoreCanonicalVersion({
      version: Number(body.version),
      expectedVersion: body.expectedVersion,
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

    return Response.json({ document: publicHostedDocument(result) });
  } catch (error) {
    return hostedErrorResponse(error);
  }
}
