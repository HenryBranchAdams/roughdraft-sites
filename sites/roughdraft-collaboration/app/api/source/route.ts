export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.redirect(new URL("/api/document/export", request.url), 307);
}
