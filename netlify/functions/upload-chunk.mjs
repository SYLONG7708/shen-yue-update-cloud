import { requireUploadKey } from "../lib/auth.mjs";
import { MAX_CHUNK_BYTES, MAX_CHUNKS, MAX_FILE_BYTES } from "../lib/config.mjs";
import { errorResponse, json } from "../lib/http.mjs";
import { getJson, setJson, uploadChunkKey, uploadMetaKey, uploadStore } from "../lib/storage.mjs";

function cleanUploadId(value) {
  const id = String(value || "").trim();
  if (!/^(apk|icon)-[a-z0-9-]{8,120}$/i.test(id)) {
    const error = new Error("上傳識別碼格式錯誤。");
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function decodeName(value) {
  try { return decodeURIComponent(String(value || "")); } catch { return String(value || ""); }
}

export default async function handler(request) {
  try {
    if (request.method !== "PUT" && request.method !== "POST") {
      return json({ ok: false, message: "只接受 PUT / POST。" }, 405);
    }
    requireUploadKey(request);
    const url = new URL(request.url);
    const uploadId = cleanUploadId(url.searchParams.get("uploadId"));
    const index = Number(url.searchParams.get("index"));
    const total = Number(url.searchParams.get("total"));
    const fileSize = Number(request.headers.get("x-file-size") || 0);
    const fileName = decodeName(request.headers.get("x-file-name")).replace(/[\\/:*?"<>|]/g, "_").slice(0, 220);
    const fileType = String(request.headers.get("x-file-type") || "application/octet-stream").slice(0, 120);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total <= 0 || index >= total || total > MAX_CHUNKS) {
      const error = new Error("分段編號或總數不正確。");
      error.statusCode = 400;
      throw error;
    }
    if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
      const error = new Error("檔名或檔案大小不正確。");
      error.statusCode = 400;
      throw error;
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) {
      const error = new Error("單一分段過大或沒有內容；請使用 3 MB 分段。");
      error.statusCode = 413;
      throw error;
    }
    const store = uploadStore();
    const metaKey = uploadMetaKey(uploadId);
    let meta = await getJson(store, metaKey);
    if (meta && (meta.fileName !== fileName || meta.fileSize !== fileSize || meta.total !== total)) {
      const error = new Error("同一上傳識別碼的檔案資料不一致。");
      error.statusCode = 409;
      throw error;
    }
    await store.set(uploadChunkKey(uploadId, index), bytes, {
      metadata: { uploadId, index, total, fileName }
    });
    const received = new Set(Array.isArray(meta?.received) ? meta.received : []);
    received.add(index);
    meta = {
      uploadId,
      fileName,
      fileSize,
      fileType,
      total,
      received: [...received].sort((a, b) => a - b),
      updatedAt: new Date().toISOString(),
      createdAt: meta?.createdAt || new Date().toISOString()
    };
    await setJson(store, metaKey, meta);
    return json({ ok: true, uploadId, index, total, received: meta.received.length, complete: meta.received.length === total });
  } catch (error) {
    console.error("upload chunk failed", error?.message || error);
    return errorResponse(error);
  }
}
