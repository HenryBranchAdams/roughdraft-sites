import { requireDocumentAccess } from "../../../../lib/hosted-documents";
import { hostedErrorResponse } from "../../../../lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { document } = await requireDocumentAccess(request, "read", {
      initializeCanonical: true,
    });

    return new Response(document.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeHeaderFilename(
          document.path.split("/").at(-1) ?? "document.md",
        )}"`,
        "Cache-Control": "private, no-store",
        "X-Roughdraft-Version": document.version,
      },
    });
  } catch (error) {
    return hostedErrorResponse(error);
  }
}

function safeHeaderFilename(value: string): string {
  return value.replace(/["\\\r\n]/g, "-");
}
