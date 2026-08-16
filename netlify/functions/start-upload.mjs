import { randomUUID } from "node:crypto";
import { requireUploadKey } from "../lib/auth.mjs";
import { GITHUB_OWNER, WORKER_REPO } from "../lib/config.mjs";
import { githubRequest } from "../lib/github.mjs";
import { errorResponse, json, parseJsonRequest } from "../lib/http.mjs";
import { getJson, jobKey, jobStore, setJson, uploadMetaKey, uploadStore } from "../lib/storage.mjs";

function validateUploadId(value, prefix) {
  const id = String(value || "").trim();
  if (!new RegExp(`^${prefix}-[a-z0-9-]{8,120}$`, "i").test(id)) {
    const error = new Error(`${prefix === "apk" ? "APK" : "圖示"} 上傳識別碼錯誤。`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

async function requireCompleteUpload(uploadId) {
  const meta = await getJson(uploadStore(), uploadMetaKey(uploadId));
  if (!meta) {
    const error = new Error(`找不到分段上傳 ${uploadId}。`);
    error.statusCode = 404;
    throw error;
  }
  const received = new Set(meta.received || []);
  if (received.size !== meta.total || [...Array(meta.total).keys()].some((index) => !received.has(index))) {
    const error = new Error(`分段尚未完整：${received.size} / ${meta.total}。`);
    error.statusCode = 409;
    throw error;
  }
  return meta;
}

export default async function handler(request) {
  let jobId = "";
  try {
    if (request.method !== "POST") return json({ ok: false, message: "只接受 POST。" }, 405);
    requireUploadKey(request);
    const body = await parseJsonRequest(request);
    const uploadId = validateUploadId(body.uploadId, "apk");
    const iconUploadId = body.iconUploadId ? validateUploadId(body.iconUploadId, "icon") : "";
    const apkMeta = await requireCompleteUpload(uploadId);
    const iconMeta = iconUploadId ? await requireCompleteUpload(iconUploadId) : null;
    if (iconMeta && iconMeta.fileSize > 20 * 1024 * 1024) {
      const error = new Error("圖示圖片不能超過 20 MB。");
      error.statusCode = 413;
      throw error;
    }
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    if (JSON.stringify(metadata).length > 20_000) {
      const error = new Error("表單內容過大。");
      error.statusCode = 413;
      throw error;
    }

    jobId = `job-${randomUUID()}`;
    const now = new Date().toISOString();
    const job = {
      jobId,
      status: "queued",
      progress: 88,
      title: "已排入 GitHub 雲端工作",
      detail: "等待雲端工人重組 APK",
      uploadId,
      iconUploadId,
      iconFileName: iconMeta?.fileName || "",
      iconFileType: iconMeta?.fileType || "",
      metadata,
      fileName: apkMeta.fileName,
      fileSize: apkMeta.fileSize,
      total: apkMeta.total,
      iconTotal: iconMeta?.total || 0,
      createdAt: now,
      updatedAt: now
    };
    await setJson(jobStore(), jobKey(jobId), job);

    await githubRequest(`/repos/${GITHUB_OWNER}/${WORKER_REPO}/dispatches`, {
      method: "POST",
      body: {
        event_type: "shen-yue-cloud-upload",
        client_payload: { jobId }
      }
    });
    return json({ ok: true, jobId, status: "queued", message: "GitHub 雲端工作已啟動。" }, 202);
  } catch (error) {
    if (jobId) {
      try {
        const store = jobStore();
        const current = await getJson(store, jobKey(jobId));
        if (current) {
          await setJson(store, jobKey(jobId), {
            ...current,
            status: "failed",
            title: "無法啟動 GitHub 雲端工作",
            detail: error.message,
            error: error.message,
            updatedAt: new Date().toISOString()
          });
        }
      } catch { /* 保留原始錯誤 */ }
    }
    console.error("start upload failed", error?.message || error);
    return errorResponse(error);
  }
}
