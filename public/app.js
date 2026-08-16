const CHUNK_SIZE = 3 * 1024 * 1024;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 - 1024;
const KEY_STORAGE = "shenYueCloudUploadKey";

const qs = (selector) => document.querySelector(selector);
const form = qs("[data-upload-form]");
const authCard = qs("[data-auth-card]");
const authForm = qs("[data-auth-form]");
const workspace = qs("[data-workspace]");
const connection = qs("[data-connection-status]");
const targetField = qs("[data-target-field]");
const targetSelect = qs("[data-target-select]");
const createFields = qs("[data-create-fields]");
const appList = qs("[data-app-list]");
const appCount = qs("[data-app-count]");
const healthList = qs("[data-health-list]");
const progressCard = qs("[data-progress-card]");
const progressTitle = qs("[data-progress-title]");
const progressPercent = qs("[data-progress-percent]");
const progressBar = qs("[data-progress-bar]");
const progressDetail = qs("[data-progress-detail]");
const resultCard = qs("[data-result-card]");
const resultTitle = qs("[data-result-title]");
const resultOutput = qs("[data-result-output]");
const submitButton = qs("[data-submit-button]");
const apkInput = form.elements.apkFile;
const iconInput = form.elements.iconFile;
let uploadKey = "";
let currentApps = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getAssetName(value) {
  const text = String(value || "").split(/[?#]/)[0];
  const raw = text.split("/").filter(Boolean).pop() || "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function resolveImage(value) {
  const text = String(value || "").trim();
  if (!text) return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='15' fill='%230e2533'/%3E%3Cpath d='M19 32h26M32 19v26' stroke='%235de6c2' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";
  if (/^(https?:|data:|blob:)/i.test(text)) return text;
  return `https://sylong7708.github.io/shen-yue-iphone-assistant/${text.replace(/^\/+/, "")}`;
}

function setConnection(title, detail, type = "") {
  connection.className = `notice ${type}`.trim();
  connection.innerHTML = `<span class="notice-dot"></span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small>`;
}

function setProgress(percent, title, detail) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent || 0))));
  progressCard.hidden = false;
  progressPercent.textContent = `${value}%`;
  progressBar.style.width = `${value}%`;
  if (title) progressTitle.textContent = title;
  if (detail) progressDetail.textContent = detail;
}

function showResult(ok, title, payload) {
  resultCard.hidden = false;
  resultCard.className = `result-card ${ok ? "success" : "error"}`;
  resultTitle.textContent = title;
  resultOutput.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function getKeyFromLocation() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  return (query.get("key") || query.get("k") || hash.get("key") || sessionStorage.getItem(KEY_STORAGE) || "").trim();
}

function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Upload-Key", uploadKey);
  headers.set("Accept", "application/json");
  return fetch(path, { ...options, headers, cache: "no-store" });
}

async function readJson(response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, message: text || `HTTP ${response.status}` }; }
  if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function renderApps(apps) {
  currentApps = Array.isArray(apps) ? apps : [];
  appCount.textContent = String(currentApps.length);
  targetSelect.innerHTML = '<option value="">自動依 APK 套件判斷</option>' + currentApps.map((item) => {
    const id = item.id || item.packageName || item.name || getAssetName(item.apkUrl);
    return `<option value="${escapeHtml(id)}">${escapeHtml(item.name || item.packageName || id)}｜${escapeHtml(item.versionName || "未標示")}</option>`;
  }).join("");
  appList.innerHTML = currentApps.map((item) => `
    <article class="app-item">
      <img src="${escapeHtml(resolveImage(item.iconUrl || item.imageUrl))}" alt="" loading="lazy">
      <div><strong>${escapeHtml(item.name || item.packageName || "未命名")}</strong><span>${escapeHtml(item.versionName || "未標示")}・${escapeHtml(getAssetName(item.apkUrl) || item.packageName || "")}</span></div>
    </article>
  `).join("") || '<p class="empty">目前清單沒有項目</p>';
}

function renderHealth(status) {
  healthList.innerHTML = `
    <div><dt>Netlify 後端</dt><dd>${status.storageReady ? "正常" : "待確認"}</dd></div>
    <div><dt>GitHub Release</dt><dd>${status.releaseReady ? escapeHtml(status.releaseTag) : "無法連線"}</dd></div>
    <div><dt>Apps Script</dt><dd>${status.appsScriptReady ? "已設定" : "未設定"}</dd></div>
    <div><dt>清單更新</dt><dd>${escapeHtml(status.manifestUpdatedAt || "未標示")}</dd></div>
  `;
}

async function loadStatus() {
  setConnection("正在連線", "檢查 Netlify、GitHub 與 Apps Script");
  try {
    const data = await readJson(await apiFetch("/api/status"));
    renderApps(data.apps);
    renderHealth(data);
    authCard.hidden = true;
    workspace.hidden = false;
    setConnection("永久雲端已連線", `目前 ${data.appsCount} 個更新項目；主機關機不影響服務`, "ok");
    return data;
  } catch (error) {
    workspace.hidden = true;
    authCard.hidden = false;
    setConnection("連線失敗", error.message || String(error), "error");
    throw error;
  }
}

function updateMode() {
  const create = form.elements.mode.value === "create";
  targetField.hidden = create;
  createFields.hidden = !create;
  document.querySelectorAll(".mode-option").forEach((label) => {
    label.classList.toggle("is-selected", Boolean(label.querySelector("input")?.checked));
  });
}

function updateFileLabel(input, titleSelector, metaSelector, fallbackTitle, fallbackMeta) {
  const file = input.files?.[0];
  qs(titleSelector).textContent = file ? file.name : fallbackTitle;
  qs(metaSelector).textContent = file ? `${formatSize(file.size)}・已選擇` : fallbackMeta;
}

function randomId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id.replace(/[^a-z0-9-]/gi, "")}`;
}

async function sendChunk(file, uploadId, index, total, attempt = 1) {
  const start = index * CHUNK_SIZE;
  const end = Math.min(file.size, start + CHUNK_SIZE);
  const chunk = file.slice(start, end);
  const url = new URL("/api/upload-chunk", location.origin);
  url.searchParams.set("uploadId", uploadId);
  url.searchParams.set("index", String(index));
  url.searchParams.set("total", String(total));
  const headers = {
    "Content-Type": "application/octet-stream",
    "X-File-Name": encodeURIComponent(file.name),
    "X-File-Size": String(file.size),
    "X-File-Type": file.type || "application/octet-stream"
  };
  try {
    return await readJson(await apiFetch(url.pathname + url.search, { method: "PUT", headers, body: chunk }));
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      return sendChunk(file, uploadId, index, total, attempt + 1);
    }
    throw error;
  }
}

async function uploadInChunks(file, uploadId, progressStart, progressEnd, label) {
  if (!file || file.size <= 0) throw new Error(`${label}檔案無效。`);
  if (file.size > MAX_FILE_SIZE) throw new Error(`${label}超過 GitHub Release 2 GiB 單檔限制。`);
  const total = Math.ceil(file.size / CHUNK_SIZE);
  for (let index = 0; index < total; index += 1) {
    await sendChunk(file, uploadId, index, total);
    const ratio = (index + 1) / total;
    const percent = progressStart + (progressEnd - progressStart) * ratio;
    setProgress(percent, `正在分段上傳${label}`, `第 ${index + 1} / ${total} 段・${formatSize(Math.min(file.size, (index + 1) * CHUNK_SIZE))} / ${formatSize(file.size)}`);
  }
  return { uploadId, fileName: file.name, fileSize: file.size, chunks: total };
}

function formMetadata() {
  const data = new FormData(form);
  return {
    mode: data.get("mode") === "create" ? "create" : "replace",
    itemId: String(data.get("itemId") || "").trim(),
    assetName: String(data.get("assetName") || "").trim(),
    appName: String(data.get("appName") || "").trim(),
    category: String(data.get("category") || "").trim(),
    description: String(data.get("description") || "").trim(),
    iconUrl: String(data.get("iconUrl") || "").trim(),
    imageUrl: String(data.get("imageUrl") || "").trim(),
    changelog: String(data.get("changelog") || "").trim()
  };
}

async function pollJob(jobId) {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const data = await readJson(await apiFetch(`/api/job-status?jobId=${encodeURIComponent(jobId)}`));
    const job = data.job;
    setProgress(job.progress || 92, job.title || "雲端背景處理中", job.detail || "請保持此頁開啟以查看結果");
    if (job.status === "complete") return job;
    if (job.status === "failed") throw new Error(job.error || "雲端背景處理失敗。");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("雲端處理超過 20 分鐘；檔案可能仍在背景執行，請稍後重新整理狀態。");
}

async function submitUpload(event) {
  event.preventDefault();
  const apk = apkInput.files?.[0];
  const icon = iconInput.files?.[0] || null;
  if (!apk || !/\.apk$/i.test(apk.name)) {
    showResult(false, "請選擇 APK", "目前沒有有效的 .apk 檔案。");
    return;
  }
  submitButton.disabled = true;
  resultCard.hidden = true;
  const uploadId = randomId("apk");
  const iconUploadId = icon ? randomId("icon") : "";
  try {
    setProgress(1, "準備安全上傳", `${apk.name}・${formatSize(apk.size)}`);
    await uploadInChunks(apk, uploadId, 2, icon ? 76 : 84, " APK");
    if (icon) await uploadInChunks(icon, iconUploadId, 76, 84, "圖標");

    setProgress(87, "啟動雲端背景工作", "正在驗證分段與建立工作");
    const started = await readJson(await apiFetch("/api/start-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, iconUploadId, metadata: formMetadata() })
    }));

    const job = await pollJob(started.jobId);
    setProgress(100, "上傳與同步完成", `${job.result?.item?.name || apk.name} 已可供更新中心使用`);
    showResult(true, "已完成永久雲端更新", {
      App: job.result?.item?.name,
      動作: job.result?.operation === "create" ? "新增" : "替換",
      版本: job.result?.item?.versionName,
      檔案: job.result?.assetName,
      大小: job.result?.item?.sizeLabel,
      SHA256: job.result?.sha256,
      GitHubRelease: job.result?.item?.apkUrl,
      更新項目數: job.result?.appsCount,
      完成時間: job.completedAt
    });
    setConnection("永久雲端同步完成", "GitHub Release、雙清單與 Apps Script 已更新", "ok");
    await loadStatus();
  } catch (error) {
    setProgress(0, "上傳失敗", error.message || String(error));
    showResult(false, "未完成", error.message || String(error));
    setConnection("上傳失敗", error.message || String(error), "error");
  } finally {
    submitButton.disabled = false;
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadKey = authForm.elements.uploadKey.value.trim();
  sessionStorage.setItem(KEY_STORAGE, uploadKey);
  try { await loadStatus(); } catch { /* 畫面已顯示錯誤 */ }
});

form.elements.mode.forEach((radio) => radio.addEventListener("change", updateMode));
apkInput.addEventListener("change", () => updateFileLabel(apkInput, "[data-apk-title]", "[data-apk-meta]", "選擇 APK", "支援大型檔案，會自動分段上傳"));
iconInput.addEventListener("change", () => updateFileLabel(iconInput, "[data-icon-title]", "[data-icon-meta]", "選擇圖標（選填）", "PNG／JPG／WEBP／GIF"));
form.addEventListener("submit", submitUpload);
qs("[data-refresh-button]").addEventListener("click", () => loadStatus().catch(() => {}));

const apkZone = qs("[data-apk-zone]");
["dragenter", "dragover"].forEach((name) => apkZone.addEventListener(name, () => apkZone.classList.add("drag")));
["dragleave", "drop"].forEach((name) => apkZone.addEventListener(name, () => apkZone.classList.remove("drag")));

uploadKey = getKeyFromLocation();
updateMode();
if (uploadKey) {
  sessionStorage.setItem(KEY_STORAGE, uploadKey);
  loadStatus().catch(() => {});
} else {
  authCard.hidden = false;
  setConnection("需要上傳密鑰", "請使用含密鑰的私人網址，或在下方輸入", "error");
}
