import { requireUploadKey } from "../lib/auth.mjs";
import { errorResponse, json } from "../lib/http.mjs";
import { getJson, jobKey, jobStore } from "../lib/storage.mjs";

export default async function handler(request) {
  try {
    requireUploadKey(request);
    const jobId = String(new URL(request.url).searchParams.get("jobId") || "");
    if (!/^job-[a-f0-9-]{20,80}$/i.test(jobId)) {
      const error = new Error("工作識別碼格式錯誤。");
      error.statusCode = 400;
      throw error;
    }
    const job = await getJson(jobStore(), jobKey(jobId));
    if (!job) {
      const error = new Error("找不到這筆雲端工作。");
      error.statusCode = 404;
      throw error;
    }
    return json({ ok: true, job });
  } catch (error) {
    return errorResponse(error);
  }
}
