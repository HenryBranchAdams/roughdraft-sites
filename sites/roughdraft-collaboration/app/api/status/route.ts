export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    backend: "sites-hosted",
    kind: "sites-hosted",
    canonical: "hosted-record",
    capabilities: {
      sharedDocuments: true,
      optimisticConcurrency: true,
      reviewEvents: true,
      assets: true,
      localFileSync: false,
    },
  });
}
