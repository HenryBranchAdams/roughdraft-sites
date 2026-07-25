import {
  listHostedActivity,
  requireDocumentAccess,
} from "../../../lib/hosted-documents";
import { hostedErrorResponse } from "../../../lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { document } = await requireDocumentAccess(request, "read");
    return Response.json(await listHostedActivity(document.id));
  } catch (error) {
    return hostedErrorResponse(error);
  }
}
