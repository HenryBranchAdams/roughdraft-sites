import { hostedErrorResponse } from "../../../lib/api-response";
import {
  createHostedDocument,
  listHostedDocuments,
  publicHostedDocument,
  publicHostedViewer,
  requireSameOriginMutation,
  requireViewer,
} from "../../../lib/hosted-documents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = requireViewer(request);
    return Response.json({
      documents: await listHostedDocuments(viewer),
      viewer: publicHostedViewer(viewer),
    });
  } catch (error) {
    return hostedErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOriginMutation(request);
    const viewer = requireViewer(request);
    const body = (await request.json()) as {
      path?: unknown;
      content?: unknown;
      operation?: unknown;
    };
    if (typeof body.content !== "string") {
      return Response.json(
        { error: "Markdown content is required." },
        { status: 400 },
      );
    }
    const document = await createHostedDocument({
      path: typeof body.path === "string" ? body.path : "",
      content: body.content,
      viewer,
      changeKind: body.operation === "import" ? "import" : "create",
    });
    return Response.json(
      { document: publicHostedDocument(document) },
      { status: 201 },
    );
  } catch (error) {
    return hostedErrorResponse(error);
  }
}
