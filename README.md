# FEELWONDER 企業AI主機 Landing Page

沉浸式捲動敘事（scrollytelling）介紹頁與需求評估問卷。純靜態 HTML／CSS／原生 JavaScript，動畫使用 GSAP 3.12.5 + ScrollTrigger（cdnjs），問卷以 PHP `mail()` 寄送。

```
index.html            介紹頁（4 段捲動轉場）
assessment.html       需求評估問卷（3 步驟、9 題）
css/style.css         共用樣式，顏色與間距皆為 CSS 變數
js/main.js            捲動轉場、進場動畫、頁尾影片
js/sequence.js        canvas 影格序列播放
js/assessment.js      問卷流程、篩選、送出（設定常數在檔案開頭）
api/submit.php        表單驗證與寄信；設定在 api/config.php
assets/               網站素材（由 tools/process_assets.sh 產生）
tools/                素材下載與處理腳本
.htaccess             HTTPS、快取、壓縮、MIME
```

## 本機預覽

```bash
php -S localhost:8080        # 在專案根目錄執行，開 http://localhost:8080
```

沒有 PHP 也可用 `python3 -m http.server 8080` 預覽畫面，只是問卷送出會失敗（結果頁仍會顯示）。

## 素材與部署

見 [DEPLOY.md](DEPLOY.md)。素材流程：`bash tools/download_assets.sh` → `bash tools/process_assets.sh`。

## 動態與備援

- 開啟「減少動態效果」、網路為 2g／3g 或 Save-Data 時：不固定畫面、不播影格，直接顯示靜態圖。
- GSAP 載入失敗時同樣退回靜態版。
- 視窗寬度 < 768px 使用手機影格（960px），捲動長度約為桌機的 70%。
