# 申悅更新中心永久雲端一鍵上傳

本專案把舊版「本機 Node.js + Cloudflare Quick Tunnel」改成永久 Netlify 網址。主機關機後，公開頁、分段上傳、背景處理、GitHub Release 發布、兩個 `updates.json` 與 Apps Script 同步仍可運作。

## 架構

1. 瀏覽器將 APK 切成 3 MB 小段。
2. Netlify Function 驗證 URL 密鑰後，把小段存入 Netlify Blobs。
3. Netlify Background Function 重組 APK、讀取 Android Manifest、計算 SHA-256。
4. APK 串流上傳到 `SYLONG7708/update` 的 `apk-cloud` Release。
5. 更新 `SYLONG7708/update/updates.json`。
6. 同步 `SYLONG7708/shen-yue-iphone-assistant/updates.json` 與 Apps Script。

GitHub token 與上傳密鑰僅存在 Netlify 加密環境變數，不寫入 Git、HTML、JavaScript 或操作紀錄。

## 必要環境變數

- `SHENYUE_UPLOAD_KEY`
- `GITHUB_TOKEN`
- `APPS_SCRIPT_ENDPOINT`
- 其他 repo / tag 變數已有安全預設值，見 `.env.example`。

## 驗證

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

更新密鑰或 token 時用 `npx netlify env:set`，不要放進檔案或命令紀錄。
