# 部署說明（hosting.com 經銷主機・cPanel）

純靜態網站（HTML／CSS／JS）＋ 一支寄信用的 PHP（`api/submit.php`）。不需要 Node 或資料庫。

## 1. 準備素材（在自己的電腦做一次）

需要 `ffmpeg`（含 libwebp、libx264、libvpx-vp9）與 `perl`。macOS：`brew install ffmpeg`；Windows：用 Git Bash 或 WSL。

```bash
bash tools/download_assets.sh      # Windows PowerShell：tools\download_assets.ps1
bash tools/process_assets.sh
```

- 原始素材下載到 `assets-src/`，這個資料夾不用上傳、也不進 git。
- `process_assets.sh` 會產生 `assets/frames/`、`assets/video/`、`assets/img/`，自動把 `index.html` 的影格數量與素材版本號（`?v=`）更新好，最後列出各資料夾大小。全部素材超過 30 MB 時，會自動降低品質或影格數重做。
- 想換掉某支影片：用新版本覆蓋 `assets-src/` 內同一個檔名，再執行一次 `process_assets.sh`。

## 2. 填寫設定

| 位置 | 要填的內容 |
|---|---|
| `api/config.php` | 先 `cp api/config.sample.php api/config.php`，再填 `mail_to`（收件信箱）、`mail_from`（網站網域的信箱）。`turnstile_secret` 不用 Turnstile 就留空 |
| `js/assessment.js` 開頭 | `BOOKING_URL`（Google 日曆預約頁或 Calendly 網址）、`CHECKLIST_URL`（檢查表下載連結）、`TURNSTILE_SITE_KEY`（不用就留空）、篩選門檻 |
| `index.html`、`assessment.html` | `og:image` 的 `【網站網址】`（例如 `https://ai.feelwonder.com`），社群分享圖需要完整網址 |

`api/config.php` 已在 `.gitignore`，金鑰與信箱不會進版本控制；不要把它們寫進前端檔案。

## 3. 上傳到 public_html

上傳這些檔案（保持資料夾結構）：

```
index.html
assessment.html
.htaccess
css/
js/
assets/        ← process_assets.sh 產生的素材
api/           ← 含 config.php、.htaccess
```

不要上傳：`assets-src/`、`tools/`、`v1/`（舊版快照，只供預覽比較）、`*.md`、`.git/`（就算誤傳，`.htaccess` 也會擋掉 `tools/`、`assets-src/` 與 `.md` 檔）。

建議作法：在電腦上把上述檔案壓成 zip → cPanel「檔案管理員」進入 `public_html` → 上傳 → 解壓縮。檔案管理員右上「設定」勾選「顯示隱藏檔案」，才看得到 `.htaccess`。

## 4. SSL 與 PHP

1. cPanel →「SSL/TLS Status」→ 對網域執行 **Run AutoSSL**，確認網域與 `www` 都是綠色鎖頭。
2. 用瀏覽器開 `http://你的網域`，應自動跳轉到 `https://`（由 `.htaccess` 處理）。
3. cPanel →「MultiPHP Manager」→ PHP 版本選 8.1 以上（最低 7.4）。
4. cPanel →「Email Accounts」建立 `mail_from` 用的信箱（例如 `noreply@你的網域`）；「Email Deliverability」確認 SPF、DKIM 為有效，避免表單通知信進垃圾郵件。
5. 開 `https://你的網域/assessment.html` 實際填一次問卷，確認收得到信。寄信失敗時結果頁仍會顯示，錯誤記錄在瀏覽器 console。

## 5. 建議：接 Cloudflare 免費 CDN

1. 在 Cloudflare 新增網站（Free 方案），依指示把網域的 nameserver 改到 Cloudflare；DNS 記錄指向 hosting.com 主機 IP，並開啟橘色雲（Proxied）。
2. **SSL/TLS → 加密模式選「Full (strict)」**（主機已有 AutoSSL 憑證）。不要用 Flexible，會造成轉址迴圈。
3. SSL/TLS → Edge Certificates：開啟「Always Use HTTPS」。
4. Speed：Brotli 預設開啟即可。**Rocket Loader 保持關閉**（會打亂 GSAP 與動畫腳本的載入順序）。
5. Caching → Cache Rules：
   - `/assets/*`：Eligible for cache，Edge TTL「Use cache-control header」（主機已送出 1 年 immutable）。
   - `/api/*`：Bypass cache。
   - HTML 保持預設（不快取 HTML）。
6. 重新產生素材後，網址上的 `?v=` 版本號會自動改變，不需要手動清快取；改了 CSS／JS 後若想立即生效，可在 Caching → Configuration →「Purge Everything」。
7. 選用：Turnstile → 新增網站取得 site key 與 secret key，分別填到 `js/assessment.js` 的 `TURNSTILE_SITE_KEY` 與 `api/config.php` 的 `turnstile_secret`。

## 6. 快取與壓縮（`.htaccess` 已設定）

- 圖片、影格、影片、字型：`Cache-Control: public, max-age=31536000, immutable`
- HTML：`no-cache`（每次向主機確認）；CSS／JS：`no-cache`（未變更時回 304）
- Gzip（mod_deflate），主機有 mod_brotli 時同時啟用 Brotli
- MIME：`.webp`、`.webm`、`.mp4`
