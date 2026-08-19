function basenameFromUrl(value) {
  const clean = String(value || "").split(/[?#]/)[0];
  const raw = clean.split("/").filter(Boolean).pop() || "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function slug(value) {
  const clean = String(value || "shen-yue-app")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || "shen-yue-app";
}

export function safeAssetName(value) {
  const name = basenameFromUrl(value).replace(/[\\/:*?"<>|]+/g, "_").trim();
  if (!name) return "";
  return /\.apk$/i.test(name) ? name : `${name}.apk`;
}

export function safeImageExtension(name, contentType = "") {
  const lowerName = basenameFromUrl(name).toLowerCase();
  const ext = lowerName.match(/\.(png|jpe?g|webp|gif)$/)?.[0] || "";
  if (ext) return ext === ".jpeg" ? ".jpg" : ext;
  const type = String(contentType).toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return "";
}

export function cleanText(value, max = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

export function cleanUrl(value) {
  const text = String(value || "").trim();
  return /^(https?:\/\/|assets\/)/i.test(text) ? text : "";
}

export function parseChangelog(value) {
  return String(value || "")
    .split(/\r?\n|[|]{2}/)
    .map((line) => cleanText(line, 160))
    .filter(Boolean)
    .slice(0, 8);
}

export function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function taipeiTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return `${formatter.format(date).replace(" ", "T")}+08:00`;
}

export function findExistingItem(manifest, query = {}, apk = {}) {
  if (query.mode === "create") return null;
  const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
  const itemId = String(query.itemId || "").trim();
  const requestedAsset = safeAssetName(query.assetName || "");
  const packageName = apk.packageName || String(query.packageName || "").trim();
  const appName = String(query.appName || "").trim();
  if (itemId) {
    const selected = apps.find((item) => [item.id, item.packageName, item.name, safeAssetName(item.apkUrl)].includes(itemId));
    if (selected) return selected;
  }
  if (requestedAsset) {
    const selected = apps.find((item) => requestedAsset === safeAssetName(item.apkUrl));
    if (selected) return selected;
  }
  if (packageName) {
    const selected = apps.find((item) => packageName === item.packageName);
    if (selected) return selected;
  }
  return appName ? (apps.find((item) => appName === item.name) || null) : null;
}

export function buildManifestItem({ existing, apk, metadata = {}, assetName, size, sha256, owner, repo, releaseTag, now = new Date() }) {
  const versionCode = Number(apk.versionCode || existing?.versionCode || 0);
  const versionName = apk.versionName || existing?.versionName || "未標示";
  const packageName = apk.packageName || existing?.packageName || "";
  const appName = cleanText(metadata.appName, 90) || existing?.name || apk.label || assetName.replace(/\.apk$/i, "");
  const category = cleanText(metadata.category, 60) || existing?.category || "其他應用";
  const description = cleanText(metadata.description, 900) || existing?.description || (existing ? "由申悅永久雲端一鍵上傳工具替換 APK。" : "由申悅永久雲端一鍵上傳工具新增。");
  const iconUrl = cleanUrl(metadata.iconUrl) || existing?.iconUrl || "assets/app-logo.png";
  const imageUrl = cleanUrl(metadata.imageUrl) || existing?.imageUrl || existing?.galleryImages?.[0] || "assets/update-splash.png";
  const galleryImages = Array.isArray(existing?.galleryImages) ? [...existing.galleryImages] : [];
  if (cleanUrl(metadata.imageUrl) && !galleryImages.includes(cleanUrl(metadata.imageUrl))) galleryImages.unshift(cleanUrl(metadata.imageUrl));
  const custom = parseChangelog(metadata.changelog);
  const changelog = custom.length ? custom : [
    `已於 ${taipeiTimestamp(now)} 由永久雲端上傳頁${existing ? "替換 APK" : "新增 APK"}`,
    `版本：${versionName} (${versionCode || "未標示"})`,
    "可在車機內下載安裝"
  ];
  return {
    id: existing?.id || slug(`${packageName || appName}-${versionCode || now.getTime()}`),
    name: appName,
    category,
    packageName,
    versionCode,
    versionName,
    minAndroid: apk.minSdk ? `Android SDK ${apk.minSdk}` : (existing?.minAndroid || "依 APK 設定"),
    targetSdk: apk.targetSdk || existing?.targetSdk || "",
    sizeLabel: formatSize(size),
    apkUrl: `https://github.com/${owner}/${repo}/releases/download/${releaseTag}/${encodeURIComponent(assetName)}`,
    sha256,
    imageUrl,
    iconUrl,
    galleryImages,
    description,
    changelog
  };
}

export function updateManifest(manifest, item, now = new Date()) {
  const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
  const index = apps.findIndex((entry) => (
    entry.id === item.id ||
    (item.packageName && entry.packageName === item.packageName) ||
    safeAssetName(entry.apkUrl) === safeAssetName(item.apkUrl)
  ));
  if (index >= 0) apps[index] = item;
  else apps.unshift(item);
  manifest.apps = apps;
  manifest.schema = 1;
  manifest.channel = manifest.channel || "stable";
  manifest.updatedAt = taipeiTimestamp(now);
  return index >= 0 ? "replace" : "create";
}
