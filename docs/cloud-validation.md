# 同步製作驗證紀錄

日期：2026-10-11。分支：feature/cloud-sync。正式網站尚未啟用雲端；沒有讀取或搬移使用者真實記事。

## 已完成

- 2026-10-11 使用者確認記憶體登入取捨，並提供公開 project URL／publishable key，已填入分支設定。使用者回報只允許專案建立本人；資料庫允許名單仍待實際驗證。
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

## 仍待驗收

- 2026-10-11 真實 API 連線：`/auth/v1/settings` 回覆 HTTP 200，但 `external.google=false`；`cat_days_allowed`／`cat_days_changes` 回覆 HTTP 404、PGRST202，`cat_days_notes` 回覆 HTTP 404、PGRST205。這是同步物件尚未出現在 API 的證據，不能當作匿名權限測試通過。未傳送或寫入任何記事。
- 指定專案控制台在目前驗收瀏覽器尚未登入，需由使用者完成登入，才能協助檢查 migration 與允許名單。Google client secret 只由使用者填入 Provider 頁面。
- 真實 Supabase project 的 migration、指定帳號允許名單及完整 API 權限設定。
- 真實 Google OAuth 同意／回呼／重新登入／session 到期與 project pause 操作。
- 真實 Supabase/PostgREST API 上的另一帳號及匿名直接請求驗證。
- 使用者兩台電腦同帳號驗收、iOS Safari／Android Chrome 實機。

隔離 SQL 與模擬 Google 身分測試不能替代以上關卡。配置未提供前，不標示跨裝置同步正式完成。

重現：`npm test`、`npm run check`、`npm run build:vendor`、`python scripts/test-database.py`。最後一項只建立隨機命名的測試容器並自動清理，不能用作真實專案安裝。
