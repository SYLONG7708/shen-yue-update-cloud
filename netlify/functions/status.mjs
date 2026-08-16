import { requireUploadKey } from "../lib/auth.mjs";
import { APPS_SCRIPT_ENDPOINT, GITHUB_OWNER, RELEASE_TAG, UPDATE_REPO } from "../lib/config.mjs";
import { getRepoJson, verifyGithub } from "../lib/github.mjs";
import { errorResponse, json } from "../lib/http.mjs";

export default async function handler(request) {
  try {
    requireUploadKey(request);
    const [{ value: manifest }, github] = await Promise.all([
      getRepoJson(GITHUB_OWNER, UPDATE_REPO, "updates.json"),
      verifyGithub(GITHUB_OWNER, UPDATE_REPO, RELEASE_TAG)
    ]);
    const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
    return json({
      ok: true,
      permanentCloud: true,
      storageReady: true,
      githubReady: Boolean(github.repository?.id),
      releaseReady: Boolean(github.release?.id),
      releaseTag: RELEASE_TAG,
      appsScriptReady: Boolean(APPS_SCRIPT_ENDPOINT),
      appsCount: apps.length,
      manifestUpdatedAt: manifest.updatedAt || "",
      apps
    });
  } catch (error) {
    console.error("status failed", error?.message || error);
    return errorResponse(error);
  }
}
