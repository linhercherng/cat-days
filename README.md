# 貓咪手帳 · cat-days

手機優先的生活記事與心情行事曆。溫暖手帳風格，讓小事有個可以留下來的地方。

## 目前階段：手機版靜態畫面樣稿

規格已確認；本階段只提供首頁、月曆、單日資訊、記事編輯四個畫面的視覺與導覽樣稿。**示範日期固定為 2026-10-10，所有記事均為虛構示範資料。輸入不會儲存，未實作 localStorage、草稿、備份、日期查詢／計算或完整節日資料。**

- [首頁](https://linhercherng.github.io/cat-days/#home)
- [月曆](https://linhercherng.github.io/cat-days/#calendar)
- [單日資訊](https://linhercherng.github.io/cat-days/#day)
- [記事編輯](https://linhercherng.github.io/cat-days/#editor)

HTML、CSS、原生 JavaScript，無第三方前端依賴、字型 CDN 或建置程序。手繪貓咪與圖示為專案內 SVG。

## 本機預覽

在專案目錄執行：

```powershell
python -m http.server 18087 --bind 127.0.0.1
```

開啟 http://127.0.0.1:18087/ 。終端機按 Ctrl+C 停止。

## 文件

- [V1 規格](docs/specification.md)
- [完整製作順序與驗收](docs/implementation-plan.md)
- [樣稿確認指南](docs/preview-guide.md)
- [本階段驗證紀錄](docs/validation.md)

GitHub Pages 使用 `main` 分支根目錄發布。正式功能須於使用者確認畫面後接續製作。個人記事與備份不納入公開 repository。
