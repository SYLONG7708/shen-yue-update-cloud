import { APPS_SCRIPT_ENDPOINT } from "./config.mjs";

export async function syncAppsScript(manifest) {
  if (!APPS_SCRIPT_ENDPOINT) return { ok: false, skipped: true, message: "未設定 Apps Script endpoint" };
  const response = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      type: "replace-update-manifest",
      app: "申悅更新中心永久雲端一鍵上傳",
      createdAt: new Date().toISOString(),
      manifest
    })
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: response.ok, text }; }
  if (!response.ok || data.ok === false) {
    throw new Error(`Apps Script 同步失敗：${data.message || text || response.status}`);
  }
  return data;
}
