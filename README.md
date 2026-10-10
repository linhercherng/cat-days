# 貓咪手帳 · cat-days

手機優先的生活記事與心情行事曆。溫暖手帳風格，讓小事有個可以留下來的地方。

## 目前階段：V1 日期與節日驗收

畫面與資料保存已由使用者確認。記事新增／修改／移日／刪除、localStorage、草稿及備份／還原已完成。本階段加入找日期、算天數、年月直接選取、導覽返回位置與 2025～2027 台灣節日。**目前停在日期與節日驗收關卡，最終手機實機與全面發布驗收尚未完成。**

算天數同時顯示不計開始日的「相隔天數」及「頭尾都算」；結束日較早時提供交換。節日保留官方年度 CSV、來源與核對日期，不自動更新，實際休假依個人班表。日期功能範圍仍為 1900～2100 年。

- [首頁](https://linhercherng.github.io/cat-days/#home)
- [月曆](https://linhercherng.github.io/cat-days/#calendar)
- [單日資訊](https://linhercherng.github.io/cat-days/#day)
- [記事編輯](https://linhercherng.github.io/cat-days/#editor)
- [資料與備份](https://linhercherng.github.io/cat-days/#data)
- [找日期](https://linhercherng.github.io/cat-days/#find)
- [算天數](https://linhercherng.github.io/cat-days/#interval)

HTML、CSS、原生 JavaScript，無第三方前端依賴、字型 CDN 或建置程序。手繪貓咪與圖示為專案內 SVG。

## 本機預覽

在專案目錄執行：

```powershell
python -u -m http.server 18089 --bind 127.0.0.1
```

開啟 http://127.0.0.1:18089/ 。終端機按 Ctrl+C 停止。JavaScript 使用模組，請透過 HTTP 開啟，不使用 file://。本機與 Pages 是不同來源，記事各自保存。

Node.js 22 或更新版本可執行 `npm test`（無需安裝依賴）；`npm run check` 檢查入口語法。

## 文件

- [V1 規格](docs/specification.md)
- [完整製作順序與驗收](docs/implementation-plan.md)
- [樣稿確認指南](docs/preview-guide.md)
- [本階段驗證紀錄](docs/validation.md)
- [資料驗收紀錄與使用者檢查步驟](docs/data-validation.md)
- [保存與備份格式](docs/data-format.md)
- [日期與節日驗收步驟](docs/date-validation.md)
- [節日資料來源](docs/holiday-sources.md)
- [同帳號雲端同步提案（尚未啟用）](docs/cloud-sync-proposal.md)

GitHub Pages 使用 `main` 分支根目錄發布。個人記事、草稿、備份與測試用私人檔案不納入公開 repository。資料只在這個瀏覽器；建議定期下載備份，換裝置後手動還原。備份沒有加密。
