import { env } from "cloudflare:workers";
import {
  findAsset,
  recordAsset,
  requireDocumentAccess,
  requireSameOriginMutation,
} from "../../../lib/hosted-documents";
import { hostedErrorResponse } from "../../../lib/api-response";

export const dynamic = "force-dynamic";

const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    await requireDocumentAccess(request, "read");
    const path = new URL(request.url).searchParams.get("path")?.trim();
    if (!path) {
      return Response.json(
        { error: "Asset path is required." },
        { status: 400 },
      );
    }

    const record = await findAsset(path);
    if (!record) {
      return Response.json({ error: "Asset not found." }, { status: 404 });
    }
    if (!env.FILES) {
      throw new Error("Cloudflare R2 binding `FILES` is unavailable.");
    }

    const object = await env.FILES.get(record.objectKey);
    if (!object) {
      return Response.json({ error: "Asset not found." }, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", record.mimeType);
    headers.set("Cache-Control", "private, max-age=300");
    headers.set(
      "Content-Disposition",
      `inline; filename="${safeHeaderFilename(record.filename)}"`,
    );
    return new Response(object.body, { headers });
  } catch (error) {
    return hostedErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOriginMutation(request);
    const { viewer } = await requireDocumentAccess(request, "write");
    if (!env.FILES) {
      throw new Error("Cloudflare R2 binding `FILES` is unavailable.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "File is required." }, { status: 400 });
    }
    if (file.size < 1 || file.size > MAX_ASSET_BYTES) {
      return Response.json(
        { error: "Files must be between 1 byte and 10 MB." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const filename = sanitizeFilename(file.name);
    const markdownPath = `./.roughdraft-assets/${id.slice(0, 8)}-${filename}`;
    const objectKey = `roughdraft-skill/${id}/${filename}`;
    const mimeType = file.type || "application/octet-stream";

    await env.FILES.put(objectKey, file.stream(), {
      httpMetadata: { contentType: mimeType },
    });

    try {
      await recordAsset({
        id,
        markdownPath,
        objectKey,
        filename,
        mimeType,
        sizeBytes: file.size,
        viewer,
      });
    } catch (error) {
      await env.FILES.delete(objectKey);
      throw error;
    }

    return Response.json(
      {
        markdownPath,
        previewUrl: `/api/assets?path=${encodeURIComponent(markdownPath)}`,
        mimeType,
      },
      { status: 201 },
    );
  } catch (error) {
    return hostedErrorResponse(error);
  }
}

function sanitizeFilename(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe || "attachment";
}

function safeHeaderFilename(value: string): string {
  return value.replace(/["\\\r\n]/g, "-");
}
