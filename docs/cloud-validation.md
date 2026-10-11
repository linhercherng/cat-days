# 同步製作驗證紀錄

日期：2026-10-11。同步版本已部署並通過真實 Google 登入／雲端新增與修改；尚未搬移使用者原本機記事。兩台實體電腦驗收尚未完成。

## 已完成

- 2026-10-11 使用者確認記憶體登入取捨，並提供公開 project URL／publishable key，已填入分支設定。使用者確認執行資料庫存取權限與返回網址設定，唯一 Google 帳號已寫入私有允許名單，未加入公開 repository。
- Google PKCE 回呼、公開設定檢查、登入憑證記憶體保存與十分钟 PKCE verifier 到期清理。依 SDK 2.108.1 實際介面製作，SDK 封裝在 repo，不從 CDN 載入。
- 私人單帳號允許名單、Google verified email 檢查、RLS、禁用直接資料表寫入；所有寫入走權限／版本檢查 RPC。
- 單帳號交易鎖與遞增游標、200 筆分頁、伺服器版本 CAS、操作冪等及遺失回覆重試。
- 新增／修改／刪除接入原編輯器。衝突選兩份或雲端、刪除正文清除與 tombstone、明確另存。
- 各帳號装置草稿含原版本，重新登入後恢復；登出隱藏雲端資料；背景同步不改編輯欄位。
- 本機先備份再預覽／確認匯入；V1 相容、V2 刪除標記與草稿、重複匯入略過、已刪可明確恢復新 ID。
- 20 秒網路逾時，離線保留草稿；未配置保留原本 localStorage 模式。

## 實際驗證

| 層級 | 範圍與結果 |
|---|---|
| Node 自動化 | 39 項通過：原 V1 回歸及新增草稿版本、帳號隔離、遺失回覆後再修改／重開、登出競態、備份與 token 不持久化等 |
| 真實 PostgreSQL 17 | migration 於全新、無對外網路的 Docker 容器成功執行；匿名／另一帳號拒絕、RLS 不洩漏、直接寫入拒絕、UTF-16 上限、CAS／冪等／刪除正文清除、備份標記通過 |
| 併發連線 | 八個獨立 PostgreSQL 連線修改同版本，恰一個成功、七個衝突，無覆蓋 |
| 真實瀏覽器＋本機 Postgres | Google 身分為模擬；正式編輯／同步／備份模組使用真實 SQL。新增、衝突保留兩份、離線重試、重開再登入草稿、已刪採用雲端、先備份匯入、V2 下載與重複還原通過；未發現 console error/warn |
| 原本機模式 | 未配置畫面、本機新增、重新整理可讀取通過 |
| 響應布局 | 同步畫面 320／375／390／430／768／1024／1440 px 無橫向溢出，320 px 按鈕高度至少 48 px |
| 依賴 | SDK 2.108.1、esbuild 0.28.2 鎖定版本；npm audit 無已知漏洞；授權一併保存 |
| 真實 Supabase 資料庫 | SQL Editor 安裝成功；四張表均啟用 RLS，私有表沒有前端政策，記事表具一項所有者讀取政策。唯一允許帳號列數為 1；私有 schema 禁止匿名使用，記事禁止匿名讀取及 authenticated 直接寫入 |
| 真實匿名 API | `cat_days_allowed`、`cat_days_changes`、`cat_days_write` 及記事表 SELECT 均回覆 HTTP 401、SQLSTATE 42501。寫入請求在執行函式前即被拒絕，沒有建立測試記事 |
| 真實資料庫角色模擬 | 在可回復交易中切換 authenticated／非允許使用者 ID，`cat_days_allowed=false`，記事 SELECT 可見筆數為 0；交易已 rollback。這不是另一個 Google 帳號的完整登入測試 |
| 真實登入返回設定 | Site URL 與唯一 Redirect URL 均為 `https://linhercherng.github.io/cat-days/`，重新載入後仍正確，沒有萬用字元 |
| 私有表 RLS 回歸 | migration 明確啟用私有三表 RLS，與控制台安裝結果一致；隔離 PostgreSQL 權限／CRUD／同步與八連線併發測試再跑通過 |
| Google Provider 設定 | 使用者回覆 Google 測試使用者及 Supabase 憑證已儲存；`/auth/v1/settings` 即時回覆 HTTP 200、`external.google=true`。秘密由使用者在控制台輸入，未加入程式、文件或 GitHub |
| 正式 Pages 部署 | PR #1 合併提交 `a81700ecf5ae8aeff7503d83db4644511e8cd259`；[Pages 工作 38097524664](https://github.com/linhercherng/cat-days/actions/runs/38097524664) 成功。線上 app.js、cloud-config.js、cloud-auth.js、cloud-store.js 及 SDK 均 HTTP 200，正規化行尾後與部署提交一致 |
| 真實 Google 與 Supabase | 指定帳號成功經 Google 同意頁與 PKCE 回呼，通過 `cat_days_allowed` 及首次變動查詢；介面進入雲端模式並顯示「已同步」 |
| 正式雲端記事讀寫 | A 分頁新增一筆明確標示的測試記事，B 分頁重新 Google 登入後可讀取；B 修改相同記事，A「立即同步」後讀到相同修改，仍只有一筆。這是同一 Chrome 的兩個分頁，不是兩台實體電腦 |
| 記憶體登入 | B 在同步頁重新整理後顯示未登入、原本機模式；再次 Google 登入後成功取得最新測試記事。已儲存雲端記事不依賴分頁記憶體快取 |

Google Audience 重新載入仍顯示測試使用者 0。此應用程式只請求 `openid`、`email`、`profile`，符合 [Google 基本登入權限例外](https://support.google.com/cloud/answer/15549945?hl=en)，不需要在測試名單才能完成基本登入；實際指定帳號已成功。網站雲端記事的唯一帳號限制由私有允許名單與 RLS／RPC 驗證實施，不能依賴 Google 的測試名單代替。

已保留 2026-10-11 一筆 `同步驗收測試`，供使用者實機讀取及刪除验收，未操作原本機記事匯入，也未刪除任何真實日記。

## 仍待驗收

- session 到期與 project pause 操作。
- 另一 Google 帳號的真實登入／權限驗證；匿名 API 與未允許資料庫角色測試已通過，未使用使用者的其他 Google 帳號。
- 正式雲端刪除、衝突與原本機記事匯入驗收；隔離 SQL 與模擬流程已通過，但不可代替正式驗收。
- 使用者兩台電腦同帳號驗收、iOS Safari／Android Chrome 實機。

隔離 SQL、資料庫角色模擬與模擬 Google 身分測試不能替代以上關卡。真實 OAuth 與基本讀寫已完成；兩台實體電腦及完整資料操作驗收仍待使用者，不標示跨裝置同步驗收完成。

重現：`npm test`、`npm run check`、`npm run build:vendor`、`python scripts/test-database.py`。最後一項只建立隨機命名的測試容器並自動清理，不能用作真實專案安裝。
