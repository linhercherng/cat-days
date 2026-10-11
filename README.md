# 貓咪手帳 · cat-days

手機優先的生活記事與心情行事曆。溫暖手帳風格，讓小事有個可以留下來的地方。

## 目前階段：跨裝置基本同步驗收完成

畫面、資料保存、找日期、算天數與台灣節日已由使用者驗收。同步程式已加入：Google PKCE 登入、單帳號資料庫權限、版本衝突、刪除同步、裝置草稿及 V1/V2 備份。**2026-10-11 已部署至 GitHub Pages，Supabase 資料表、帳號權限、返回網址與 Google Provider 已設定；指定帳號真實登入及兩分頁雲端新增／修改讀取通過，匿名 API 拒絕存取。使用者已確認兩台實體電腦的新增、修改、刪除同步及重新整理後再登入取回雲端記事均通過。** 衝突、舊本機記事匯入及其他延伸實機驗證的範圍見同步驗證紀錄。

算天數同時顯示不計開始日的「相隔天數」及「頭尾都算」；結束日較早時提供交換。節日保留官方年度 CSV、來源與核對日期，不自動更新，實際休假依個人班表。日期功能範圍仍為 1900～2100 年。

- [首頁](https://linhercherng.github.io/cat-days/#home)
- [月曆](https://linhercherng.github.io/cat-days/#calendar)
- [單日資訊](https://linhercherng.github.io/cat-days/#day)
- [記事編輯](https://linhercherng.github.io/cat-days/#editor)
- [資料與備份](https://linhercherng.github.io/cat-days/#data)
- [找日期](https://linhercherng.github.io/cat-days/#find)
- [算天數](https://linhercherng.github.io/cat-days/#interval)

HTML、CSS、原生 JavaScript。同步啟用時載入專案內封裝的 Supabase SDK；没有外部腳本或字型 CDN，Pages 不需建置。手繪貓咪與圖示為專案內 SVG。

## 本機預覽

在專案目錄執行：

```powershell
python -u -m http.server 18089 --bind 127.0.0.1
```

開啟 http://127.0.0.1:18089/ 。終端機按 Ctrl+C 停止。JavaScript 使用模組，請透過 HTTP 開啟，不使用 file://。本機與 Pages 是不同來源，記事各自保存。

Node.js 22 或更新版本可執行 `npm test`（無需安裝依賴）；`npm run check` 檢查入口語法。

更新 SDK 封裝：`npm ci` → `npm run build:vendor`；提交 package-lock.json、vendor 檔案及授權。Docker 可用時，`python scripts/test-database.py` 執行隔離 PostgreSQL 權限／併發測試，測試容器自動移除。

## 文件

- [V1 規格](docs/specification.md)
- [完整製作順序與驗收](docs/implementation-plan.md)
- [樣稿確認指南](docs/preview-guide.md)
- [本階段驗證紀錄](docs/validation.md)
- [資料驗收紀錄與使用者檢查步驟](docs/data-validation.md)
- [保存與備份格式](docs/data-format.md)
- [日期與節日驗收步驟](docs/date-validation.md)
- [節日資料來源](docs/holiday-sources.md)
- [跨裝置同步定稿、製作順序與驗收](docs/cloud-sync-specification.md)
- [Supabase 與 Google 啟用步驟](docs/cloud-setup.md)
- [同步實作與驗證紀錄](docs/cloud-validation.md)
- [兩台電腦同步驗收清單](docs/cloud-acceptance.md)

GitHub Pages 使用 `main` 分支根目錄發布。個人記事、草稿、備份與允許登入的 email 不納入公開 repository。未登入資料只在目前瀏覽器；同步啟用且登入時正式記事保存在自己的 Supabase，草稿依帳號留在各裝置。登入 token 只在記憶體，重開需再登入。備份沒有加密。
