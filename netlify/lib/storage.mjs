import { getStore } from "@netlify/blobs";
import { JOB_STORE_NAME, UPLOAD_STORE_NAME } from "./config.mjs";

export function uploadStore() {
  return getStore({ name: UPLOAD_STORE_NAME, consistency: "strong" });
}

export function jobStore() {
  return getStore({ name: JOB_STORE_NAME, consistency: "strong" });
}

export async function getJson(store, key) {
  const value = await store.get(key, { type: "text", consistency: "strong" });
  if (value == null) return null;
  try { return JSON.parse(value); } catch { return null; }
}

export function setJson(store, key, value) {
  return store.set(key, JSON.stringify(value), { metadata: { contentType: "application/json" } });
}

export function uploadMetaKey(uploadId) {
  return `${uploadId}/meta.json`;
}

export function uploadChunkKey(uploadId, index) {
  return `${uploadId}/chunks/${String(index).padStart(4, "0")}.bin`;
}

export function jobKey(jobId) {
  return `${jobId}.json`;
}

export async function updateJob(jobId, patch) {
  const store = jobStore();
  const current = await getJson(store, jobKey(jobId));
  if (!current) throw new Error(`找不到工作 ${jobId}。`);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await setJson(store, jobKey(jobId), next);
  return next;
}

export async function cleanupUpload(uploadId) {
  if (!uploadId) return;
  const store = uploadStore();
  const meta = await getJson(store, uploadMetaKey(uploadId));
  if (!meta) return;
  const keys = [...Array(meta.total).keys()].map((index) => uploadChunkKey(uploadId, index));
  for (let index = 0; index < keys.length; index += 20) {
    await Promise.all(keys.slice(index, index + 20).map((key) => store.delete(key).catch(() => {})));
  }
  await store.delete(uploadMetaKey(uploadId)).catch(() => {});
}
