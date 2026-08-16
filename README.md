# 申悅更新中心｜永久雲端一鍵上傳

這個專案已把舊版「本機 Node.js + Cloudflare Quick Tunnel」改成不依賴家中主機的永久雲端架構。電腦關機後，公開頁面、APK 分段上傳、背景處理、GitHub Release 發布、兩份 `updates.json` 與 Apps Script 同步都能繼續運作。

正式網站：<https://shen-yue-update-cloud.netlify.app/>

## 架構

1. 瀏覽器把 APK 切成 3 MB 安全分段。
2. Netlify Functions 驗證管理密碼，分段存入 Netlify Blobs。
3. Netlify 建立工作並透過 GitHub API 觸發本儲存庫的 GitHub Actions。
4. GitHub 雲端工人重組 APK、解析 Android Manifest、計算 SHA-256。
5. APK 串流上傳到 `SYLONG7708/update` 的 `apk-cloud` Release。
6. 同步 `SYLONG7708/update/updates.json`、`SYLONG7708/shen-yue-iphone-assistant/updates.json` 與 Apps Script。
7. 網頁輪詢工作狀態並顯示完成或錯誤訊息。

GitHub 權杖與管理密碼只存放在 Netlify 環境變數及 GitHub Actions Secrets，不會寫入 Git、HTML 或前端 JavaScript。

## 必要設定

Netlify 環境變數：

- `SHENYUE_UPLOAD_KEY`
- `GITHUB_TOKEN`
- `APPS_SCRIPT_ENDPOINT`
- `GITHUB_OWNER`
- `GITHUB_UPDATE_REPO`
- `GITHUB_ASSISTANT_REPO`
- `GITHUB_WORKER_REPO`
- `GITHUB_RELEASE_TAG`

GitHub Actions Secrets：

- `SHENYUE_UPLOAD_KEY`
- `CLOUD_SYNC_TOKEN`
- `APPS_SCRIPT_ENDPOINT`

## 本機驗證

```powershell
npm install
npm run check
npm test
npx netlify dev
```

## 正式部署

```powershell
npx netlify deploy --prod
```

請勿把 token 或管理密碼放進程式碼、命令紀錄或公開網址。可用 `tools/import-netlify-secrets.ps1 -UploadPassword '<新密碼>'` 同步更新 Netlify 與 GitHub Actions Secrets。
