import { requireUploadKey } from "../lib/auth.mjs";
import { errorResponse, json, parseJsonRequest } from "../lib/http.mjs";
import { cleanupUpload, getJson, jobKey, jobStore, updateJob } from "../lib/storage.mjs";

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export default async function handler(request) {
  try {
    if (request.method !== "POST") return json({ ok: false, message: "只接受 POST。" }, 405);
    requireUploadKey(request);
    const body = await parseJsonRequest(request, 100_000);
    const jobId = String(body.jobId || "");
    if (!/^job-[a-f0-9-]{20,80}$/i.test(jobId)) {
      const error = new Error("工作識別碼錯誤。");
      error.statusCode = 400;
      throw error;
    }
    const current = await getJson(jobStore(), jobKey(jobId));
    if (!current) {
      const error = new Error("找不到雲端工作。");
      error.statusCode = 404;
      throw error;
    }
    const source = body.patch && typeof body.patch === "object" ? body.patch : {};
    const allowedStatus = new Set(["queued", "processing", "complete", "failed"]);
    const patch = {
      status: allowedStatus.has(source.status) ? source.status : current.status,
      progress: Math.max(0, Math.min(100, Number(source.progress ?? current.progress) || 0)),
      title: cleanText(source.title ?? current.title, 160),
      detail: cleanText(source.detail ?? current.detail, 800)
    };
    if (source.error) patch.error = cleanText(source.error, 2000);
    if (source.result && JSON.stringify(source.result).length <= 80_000) patch.result = source.result;
    if (patch.status === "complete") patch.completedAt = new Date().toISOString();
    if (patch.status === "failed") patch.failedAt = new Date().toISOString();
    const next = await updateJob(jobId, patch);
    if (patch.status === "complete") {
      await cleanupUpload(current.uploadId);
      await cleanupUpload(current.iconUploadId);
    }
    return json({ ok: true, job: next });
  } catch (error) {
    return errorResponse(error);
  }
}
