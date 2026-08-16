import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ApkReader = require("@devicefarmer/adbkit-apkreader");

function plainLabel(value) {
  const text = String(value || "").trim();
  return /^resourceId:/i.test(text) ? "" : text;
}

export async function inspectApk(filePath) {
  const reader = await ApkReader.open(filePath);
  const manifest = await reader.readManifest();
  const usesSdk = manifest.usesSdk || {};
  const application = manifest.application || {};
  return {
    packageName: String(manifest.package || ""),
    versionCode: Number(manifest.versionCode || 0),
    versionName: String(manifest.versionName || ""),
    label: plainLabel(application.label),
    minSdk: String(usesSdk.minSdkVersion || ""),
    targetSdk: String(usesSdk.targetSdkVersion || "")
  };
}
