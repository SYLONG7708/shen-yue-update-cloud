import { requireUploadKey } from "../lib/auth.mjs";
import { errorResponse, json } from "../lib/http.mjs";
import { getJson, uploadChunkKey, uploadMetaKey, uploadStore } from "../lib/storage.mjs";

function validateUploadId(value) {
  const id = String(value || "").trim();
  if (!/^(apk|icon)-[a-z0-9-]{8,120}$/i.test(id)) {
    const error = new Error("上傳識別碼錯誤。");
    error.statusCode = 400;
    throw error;
  }
  return id;
}

export default async function handler(request) {
  try {
    if (request.method !== "GET") return json({ ok: false, message: "只接受 GET。" }, 405);
    requireUploadKey(request);
    const url = new URL(request.url);
    const uploadId = validateUploadId(url.searchParams.get("uploadId"));
    const index = Number(url.searchParams.get("index"));
    const store = uploadStore();
    const meta = await getJson(store, uploadMetaKey(uploadId));
    if (!meta) {
      const error = new Error("找不到上傳資料。");
      error.statusCode = 404;
      throw error;
    }
    if (!Number.isInteger(index) || index < 0 || index >= meta.total) {
      const error = new Error("分段編號錯誤。");
      error.statusCode = 400;
      throw error;
    }
    const chunk = await store.get(uploadChunkKey(uploadId, index), { type: "arrayBuffer", consistency: "strong" });
    if (chunk == null) {
      const error = new Error("找不到指定分段。");
      error.statusCode = 404;
      throw error;
    }
    return new Response(chunk, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(chunk.byteLength),
        "Cache-Control": "no-store",
        "X-Upload-Total": String(meta.total)
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
