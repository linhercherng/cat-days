# 同步製作驗證紀錄

日期：2026-10-11。同步版本準備部署；尚未讀取或搬移使用者真實記事。真實登入及實機驗收以後續紀錄為準。

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

## 仍待驗收

- 真實 Google OAuth 同意／回呼／重新登入／session 到期與 project pause 操作。
- 真實 Supabase/PostgREST API 上指定帳號及另一 Google 帳號的登入／權限驗證。
- 使用者兩台電腦同帳號驗收、iOS Safari／Android Chrome 實機。

隔離 SQL、資料庫角色模擬與模擬 Google 身分測試不能替代以上關卡。尚未完成真實 OAuth 與兩台電腦驗收，不標示跨裝置同步正式完成。

重現：`npm test`、`npm run check`、`npm run build:vendor`、`python scripts/test-database.py`。最後一項只建立隨機命名的測試容器並自動清理，不能用作真實專案安裝。
