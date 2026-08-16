export const GITHUB_OWNER = process.env.GITHUB_OWNER || "SYLONG7708";
export const UPDATE_REPO = process.env.GITHUB_UPDATE_REPO || "update";
export const ASSISTANT_REPO = process.env.GITHUB_ASSISTANT_REPO || "shen-yue-iphone-assistant";
export const WORKER_REPO = process.env.GITHUB_WORKER_REPO || "shen-yue-update-cloud";
export const RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || "apk-cloud";
export const APPS_SCRIPT_ENDPOINT = process.env.APPS_SCRIPT_ENDPOINT || "";
export const UPLOAD_STORE_NAME = "shen-yue-upload-parts";
export const JOB_STORE_NAME = "shen-yue-upload-jobs";
export const MAX_CHUNK_BYTES = 3.25 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024 - 1024;
export const MAX_CHUNKS = 800;

export function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`伺服器尚未設定 ${name}。`);
  return value;
}
