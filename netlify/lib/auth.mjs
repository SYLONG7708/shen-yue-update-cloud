import { timingSafeEqual } from "node:crypto";
import { requiredEnv } from "./config.mjs";

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readUploadKey(request) {
  const url = new URL(request.url);
  return String(
    request.headers.get("x-upload-key") ||
    request.headers.get("x-upload-token") ||
    url.searchParams.get("key") ||
    url.searchParams.get("k") ||
    ""
  ).trim();
}

export function requireUploadKey(request) {
  const expected = requiredEnv("SHENYUE_UPLOAD_KEY");
  const actual = readUploadKey(request);
  if (!actual || !safeEqual(actual, expected)) {
    const error = new Error("上傳密鑰不正確，無法使用雲端服務。");
    error.statusCode = 401;
    throw error;
  }
  return actual;
}
