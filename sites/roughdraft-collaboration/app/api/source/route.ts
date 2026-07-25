export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const source = new URL(request.url);
  const destination = new URL("/api/document/export", source);
  const documentId = source.searchParams.get("document");
  if (documentId) destination.searchParams.set("document", documentId);
  return Response.redirect(destination, 307);
}
