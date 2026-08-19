import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildManifestItem, findExistingItem, safeAssetName, updateManifest } from "../netlify/lib/manifest.mjs";

test("safeAssetName removes unsafe path characters", () => {
  assert.equal(safeAssetName("https://example.com/files/demo.apk?x=1"), "demo.apk");
  assert.equal(safeAssetName("folder\\bad:name"), "folder_bad_name.apk");
});

test("findExistingItem matches package in replace mode", () => {
  const manifest = { apps: [{ id: "demo-1", name: "Demo", packageName: "tw.demo", apkUrl: "https://example.com/demo.apk" }] };
  assert.equal(findExistingItem(manifest, { mode: "replace" }, { packageName: "tw.demo" })?.id, "demo-1");
  assert.equal(findExistingItem(manifest, { mode: "create" }, { packageName: "tw.demo" }), null);
});

test("replacement target and package take priority over the requested new display name", () => {
  const manifest = {
    apps: [
      { id: "other-1", name: "替換後新名稱", packageName: "tw.other", apkUrl: "https://example.com/other.apk" },
      { id: "demo-1", name: "替換前名稱", packageName: "tw.demo", apkUrl: "https://example.com/demo.apk" }
    ]
  };
  const query = { mode: "replace", itemId: "demo-1", appName: "替換後新名稱" };
  assert.equal(findExistingItem(manifest, query, { packageName: "tw.demo" })?.id, "demo-1");
  assert.equal(findExistingItem(manifest, { mode: "replace", appName: "替換後新名稱" }, { packageName: "tw.demo" })?.id, "demo-1");
});

test("build and update manifest preserves identity while replacing", () => {
  const existing = {
    id: "tw-demo-1",
    name: "舊名稱",
    category: "工具",
    packageName: "tw.demo",
    versionCode: 1,
    versionName: "1.0",
    apkUrl: "https://github.com/SYLONG7708/update/releases/download/apk-cloud/tw-demo.apk",
    iconUrl: "assets/old.png",
    description: "舊介紹"
  };
  const item = buildManifestItem({
    existing,
    apk: { packageName: "tw.demo", versionCode: 2, versionName: "2.0", minSdk: "23", targetSdk: "36" },
    metadata: {},
    assetName: "tw-demo.apk",
    size: 5 * 1024 * 1024,
    sha256: "a".repeat(64),
    owner: "SYLONG7708",
    repo: "update",
    releaseTag: "apk-cloud",
    now: new Date("2026-08-16T00:00:00Z")
  });
  assert.equal(item.id, existing.id);
  assert.equal(item.name, existing.name);
  assert.equal(item.versionCode, 2);
  assert.equal(item.iconUrl, existing.iconUrl);
  const manifest = { schema: 1, apps: [existing] };
  assert.equal(updateManifest(manifest, item, new Date("2026-08-16T00:00:00Z")), "replace");
  assert.equal(manifest.apps.length, 1);
  assert.equal(manifest.apps[0].versionName, "2.0");
});

test("replacement can update display name without changing app identity", () => {
  const existing = {
    id: "tw-demo-1",
    name: "替換前名稱",
    category: "工具",
    packageName: "tw.demo",
    versionCode: 1,
    versionName: "1.0",
    apkUrl: "https://github.com/SYLONG7708/update/releases/download/apk-cloud/tw-demo.apk"
  };
  const item = buildManifestItem({
    existing,
    apk: { packageName: "tw.demo", versionCode: 2, versionName: "2.0" },
    metadata: { appName: "  替換後新名稱  " },
    assetName: "tw-demo.apk",
    size: 1024,
    sha256: "b".repeat(64),
    owner: "SYLONG7708",
    repo: "update",
    releaseTag: "apk-cloud"
  });
  assert.equal(item.name, "替換後新名稱");
  assert.equal(item.id, existing.id);
  assert.equal(item.packageName, existing.packageName);
});

test("replacement form exposes app display name outside create-only fields", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const appNameIndex = html.indexOf('name="appName"');
  const createFieldsStart = html.indexOf('data-create-fields');
  const filesStart = html.indexOf('class="files-grid"');
  assert.ok(appNameIndex > -1);
  assert.ok(appNameIndex < createFieldsStart);
  assert.doesNotMatch(html.slice(createFieldsStart, filesStart), /name="appName"/);
  assert.match(html, /替換既有 APK 時可直接輸入新名稱/);
});
