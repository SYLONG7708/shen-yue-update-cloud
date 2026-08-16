import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectApk } from "../netlify/lib/apk.mjs";
import { syncAppsScript } from "../netlify/lib/apps-script.mjs";
import { ASSISTANT_REPO, GITHUB_OWNER, RELEASE_TAG, UPDATE_REPO } from "../netlify/lib/config.mjs";
import { ensureRelease, getRepoJson, putRepoFile, putRepoJson, uploadReleaseAsset } from "../netlify/lib/github.mjs";
import { buildManifestItem, findExistingItem, safeAssetName, safeImageExtension, slug, updateManifest } from "../netlify/lib/manifest.mjs";

const baseUrl = String(process.env.UPLOAD_BASE_URL || "").replace(/\/$/, "");
const uploadKey = String(process.env.SHENYUE_UPLOAD_KEY || "");
const jobId = String(process.env.JOB_ID || "");

if (!baseUrl || !uploadKey || !/^job-[a-f0-9-]{20,80}$/i.test(jobId)) {
  throw new Error("雲端工人缺少必要設定。");
}

async function cloudRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Upload-Key", uploadKey);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`申悅雲端 API ${response.status}：${text.slice(0, 500)}`);
  }
  return response;
}

async function cloudJson(path, options = {}) {
  const response = await cloudRequest(path, options);
  return response.json();
}

async function updateJob(patch) {
  return cloudJson("/api/worker-job-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, patch })
  });
}

async function downloadUpload(uploadId, total, destination) {
  const file = await open(destination, "w");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for (let index = 0; index < total; index += 1) {
      const response = await cloudRequest(`/api/worker-download?uploadId=${encodeURIComponent(uploadId)}&index=${index}`);
      const chunk = Buffer.from(await response.arrayBuffer());
      await file.write(chunk);
      hash.update(chunk);
      bytes += chunk.length;
      if (index % 10 === 0 || index + 1 === total) {
        const progress = 89 + Math.round(((index + 1) / total) * 3);
        await updateJob({ status: "processing", progress, title: "重組 APK", detail: `已下載 ${index + 1} / ${total} 個安全分段` });
      }
    }
  } finally {
    await file.close();
  }
  return { bytes, sha256: hash.digest("hex") };
}

function existingAssetName(item) {
  return safeAssetName(item?.apkUrl || "");
}

async function run() {
  const status = await cloudJson(`/api/job-status?jobId=${encodeURIComponent(jobId)}`);
  const job = status.job;
  if (!job || job.status === "complete") return;

  const apkPath = join(process.env.RUNNER_TEMP || tmpdir(), `${jobId}.apk`);
  const iconPath = job.iconUploadId ? join(process.env.RUNNER_TEMP || tmpdir(), `${jobId}.icon`) : "";
  try {
    await updateJob({ status: "processing", progress: 89, title: "GitHub 雲端工人已接手", detail: "正在下載並重組 APK 分段" });
    const assembled = await downloadUpload(job.uploadId, Number(job.total), apkPath);
    if (assembled.bytes !== Number(job.fileSize)) throw new Error(`APK 大小不符：${assembled.bytes} / ${job.fileSize}`);
    const fileInfo = await stat(apkPath);

    await updateJob({ status: "processing", progress: 93, title: "讀取 APK 資訊", detail: "解析套件名稱、版本與 Android SDK" });
    const apk = await inspectApk(apkPath);
    if (!apk.packageName) throw new Error("APK 無法讀取套件名稱，已停止發布。");

    const { value: manifest } = await getRepoJson(GITHUB_OWNER, UPDATE_REPO, "updates.json");
    if (!Array.isArray(manifest.apps)) manifest.apps = [];
    const metadata = job.metadata || {};
    const existing = findExistingItem(manifest, metadata, apk);
    const requestedAsset = safeAssetName(metadata.assetName || "");
    const generatedAsset = `${slug(`${apk.packageName || apk.label || "shen-yue-app"}-${apk.versionCode || Date.now()}`)}.apk`;
    const candidateAsset = existingAssetName(existing) || requestedAsset || generatedAsset;

    if (metadata.dryRun === true) {
      const item = buildManifestItem({
        existing,
        apk,
        metadata,
        assetName: candidateAsset,
        size: fileInfo.size,
        sha256: assembled.sha256,
        owner: GITHUB_OWNER,
        repo: UPDATE_REPO,
        releaseTag: RELEASE_TAG
      });
      await updateJob({
        status: "complete",
        progress: 100,
        title: "安全乾跑完成",
        detail: `${item.name || apk.packageName} 已通過雲端全流程檢查，正式資料未變更`,
        result: {
          dryRun: true,
          operation: existing ? "replace" : "create",
          item,
          assetName: candidateAsset,
          sha256: assembled.sha256,
          size: fileInfo.size,
          apk,
          appsCount: manifest.apps.length,
          manifestUpdatedAt: manifest.updatedAt
        }
      });
      return;
    }

    await updateJob({ status: "processing", progress: 95, title: "上傳 GitHub Release", detail: `${candidateAsset}，${Math.round(fileInfo.size / 1024 / 1024)} MB` });
    const release = await ensureRelease(GITHUB_OWNER, UPDATE_REPO, RELEASE_TAG);
    const uploadedAsset = await uploadReleaseAsset({
      owner: GITHUB_OWNER,
      repo: UPDATE_REPO,
      release,
      assetName: candidateAsset,
      filePath: apkPath,
      fileSize: fileInfo.size,
      contentType: "application/vnd.android.package-archive"
    });
    const assetName = uploadedAsset.name || candidateAsset;
    const item = buildManifestItem({
      existing,
      apk,
      metadata,
      assetName,
      size: fileInfo.size,
      sha256: assembled.sha256,
      owner: GITHUB_OWNER,
      repo: UPDATE_REPO,
      releaseTag: RELEASE_TAG
    });

    if (job.iconUploadId) {
      await updateJob({ status: "processing", progress: 97, title: "同步 App 圖示", detail: "更新兩個 GitHub 儲存庫的圖示" });
      await downloadUpload(job.iconUploadId, Number(job.iconTotal), iconPath);
      const extension = safeImageExtension(job.iconFileName, job.iconFileType);
      if (!extension) throw new Error("圖示格式不支援；請使用 PNG、JPG、WEBP 或 GIF。");
      const iconRelativePath = `assets/update-icons/${slug(item.id || item.packageName || item.name)}-icon${extension}`;
      const iconBuffer = await readFile(iconPath);
      await putRepoFile(GITHUB_OWNER, UPDATE_REPO, iconRelativePath, iconBuffer, `Update ${item.name} icon from permanent cloud uploader`);
      await putRepoFile(GITHUB_OWNER, ASSISTANT_REPO, iconRelativePath, iconBuffer, `Update ${item.name} icon from permanent cloud uploader`);
      item.iconUrl = iconRelativePath;
    }

    const operation = updateManifest(manifest, item);
    await updateJob({ status: "processing", progress: 98, title: "同步更新清單", detail: "更新 update 與 shen-yue-iphone-assistant" });
    const message = `${operation === "create" ? "Add" : "Update"} ${item.name} from permanent cloud uploader`;
    await putRepoJson(GITHUB_OWNER, UPDATE_REPO, "updates.json", manifest, message);
    await putRepoJson(GITHUB_OWNER, ASSISTANT_REPO, "updates.json", manifest, `Sync ${item.name} manifest from permanent cloud uploader`);

    await updateJob({ status: "processing", progress: 99, title: "同步 Apps Script", detail: "更新車機即時讀取清單" });
    const appsScript = await syncAppsScript(manifest);
    await updateJob({
      status: "complete",
      progress: 100,
      title: "永久雲端同步完成",
      detail: `${item.name} 已${operation === "create" ? "新增" : "替換"}`,
      result: {
        operation,
        item,
        assetName,
        sha256: assembled.sha256,
        size: fileInfo.size,
        apk,
        appsCount: manifest.apps.length,
        manifestUpdatedAt: manifest.updatedAt,
        appsScript: { ok: appsScript.ok !== false, skipped: Boolean(appsScript.skipped) }
      }
    });
  } finally {
    await unlink(apkPath).catch(() => {});
    if (iconPath) await unlink(iconPath).catch(() => {});
  }
}

try {
  await run();
} catch (error) {
  console.error(error?.stack || error);
  await updateJob({
    status: "failed",
    progress: 0,
    title: "GitHub 雲端處理失敗",
    detail: error?.message || String(error),
    error: error?.message || String(error)
  }).catch(() => {});
  throw error;
}
