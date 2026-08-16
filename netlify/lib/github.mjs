import https from "node:https";
import { createReadStream } from "node:fs";
import { requiredEnv } from "./config.mjs";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";

function token() {
  return requiredEnv("GITHUB_TOKEN");
}

export async function githubRequest(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_ROOT}${path}`;
  const headers = new Headers(options.headers || {});
  headers.set("Accept", options.accept || "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token()}`);
  headers.set("X-GitHub-Api-Version", API_VERSION);
  headers.set("User-Agent", "shen-yue-update-cloud");
  let body = options.body;
  if (body && !(body instanceof Uint8Array) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetch(url, { method: options.method || "GET", headers, body });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}：${data?.message || text || "未知錯誤"}`);
    error.statusCode = response.status;
    error.githubData = data;
    throw error;
  }
  return data;
}

export async function getRepoJson(owner, repo, filePath) {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=main`);
  const text = Buffer.from(String(data.content || "").replace(/\s/g, ""), "base64").toString("utf8").replace(/^\uFEFF/, "");
  return { value: JSON.parse(text), sha: data.sha };
}

export async function putRepoJson(owner, repo, filePath, value, message) {
  const current = await getRepoJson(owner, repo, filePath);
  return githubRequest(`/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    body: {
      message,
      content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").toString("base64"),
      sha: current.sha,
      branch: "main"
    }
  });
}

export async function putRepoFile(owner, repo, filePath, buffer, message) {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  let sha;
  try {
    const current = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=main`);
    sha = current.sha;
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const body = {
    message,
    content: Buffer.from(buffer).toString("base64"),
    branch: "main"
  };
  if (sha) body.sha = sha;
  return githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}`, { method: "PUT", body });
}

export async function ensureRelease(owner, repo, tag) {
  try {
    return await githubRequest(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    return githubRequest(`/repos/${owner}/${repo}/releases`, {
      method: "POST",
      body: {
        tag_name: tag,
        target_commitish: "main",
        name: "ShenYue APK Cloud Downloads",
        body: "Shen Yue update center APK cloud files",
        draft: false,
        prerelease: false
      }
    });
  }
}

export async function uploadReleaseAsset({ owner, repo, release, assetName, filePath, fileSize, contentType }) {
  const existing = (release.assets || []).find((asset) => asset.name === assetName);
  if (existing) await githubRequest(`/repos/${owner}/${repo}/releases/assets/${existing.id}`, { method: "DELETE" });

  return new Promise((resolve, reject) => {
    const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`;
    const request = https.request({
      hostname: "uploads.github.com",
      path,
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token()}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "shen-yue-update-cloud",
        "Content-Type": contentType || "application/vnd.android.package-archive",
        "Content-Length": String(fileSize)
      }
    }, (response) => {
      const parts = [];
      response.on("data", (chunk) => parts.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        let data;
        try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          const error = new Error(`GitHub Release 上傳失敗 ${response.statusCode}：${data?.message || text || "未知錯誤"}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    request.on("error", reject);
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.pipe(request);
  });
}

export async function verifyGithub(owner, repo, tag) {
  const repository = await githubRequest(`/repos/${owner}/${repo}`);
  let release = null;
  try { release = await githubRequest(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`); } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  return { repository, release };
}
