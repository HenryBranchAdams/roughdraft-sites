import {
  listCanonicalActivity,
  requireDocumentAccess,
} from "../../../lib/hosted-documents";
import { hostedErrorResponse } from "../../../lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireDocumentAccess(request, "read");
    return Response.json(await listCanonicalActivity());
  } catch (error) {
    return hostedErrorResponse(error);
  }
}
