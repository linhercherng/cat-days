# 貓咪手帳 · cat-days

手機優先的生活記事與心情行事曆。溫暖手帳風格，讓小事有個可以留下來的地方。

## 目前階段：V1 資料驗收

畫面已由使用者確認。本階段完成日期規則、同日多筆記事新增／修改／移日／刪除、localStorage、草稿暫存及 JSON 備份／預覽／合併還原。首次使用為空白資料，今天依台灣時間判定。**目前停在資料驗收關卡，尚非完整 V1。**

找日期、算天數、年月直接選取、完整導覽位置保留與 2025～2027 台灣節日資料仍待下一階段。首頁與月曆已接上基本資料顯示，供本次驗收使用。

- [首頁](https://linhercherng.github.io/cat-days/#home)
- [月曆](https://linhercherng.github.io/cat-days/#calendar)
- [單日資訊](https://linhercherng.github.io/cat-days/#day)
- [記事編輯](https://linhercherng.github.io/cat-days/#editor)
- [資料與備份](https://linhercherng.github.io/cat-days/#data)

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

GitHub Pages 使用 `main` 分支根目錄發布。個人記事、草稿、備份與測試用私人檔案不納入公開 repository。資料只在這個瀏覽器；建議定期下載備份，換裝置後手動還原。備份沒有加密。
