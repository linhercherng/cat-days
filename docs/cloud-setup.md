# 貓咪手帳：雲端啟用步驟

目前程式已提供同步功能，cloud-config.js 已填入使用者提供的公開設定，Google Provider 已啟用，進入正式網站部署與登入驗證階段。兩台電腦實機驗收仍須完成。

2026-10-11 已在專案 `osvbnbzadifspnbgclld` 安裝同步資料表與函式，四張表均啟用 RLS，唯一帳號允許名單及 Site／Redirect URL 已保存。匿名讀寫 API 回覆 401 拒絕；使用者儲存 Google Client ID／Secret 與測試使用者後，Auth API 確認 `external.google=true`。Supabase 控制台帳號及專案成員名單，不等於本網站的 Google Provider 與資料庫允許名單。

此專案 Google OAuth 的 Authorized redirect URI：`https://osvbnbzadifspnbgclld.supabase.co/auth/v1/callback`。網站 Site URL 與允許的 Redirect URL：`https://linhercherng.github.io/cat-days/`。

1. 在你持有的 Supabase 帳號建立 Free 專案，選擇合適地區。專案資料庫密碼自己保管；不要貼到 Chat 或 GitHub。若要註冊帳號與接受服務條款，請由你本人完成。
2. 在 SQL Editor 執行 `supabase/migrations/202610110001_sync.sql`。此專案已完成這一步；這是首次安裝 migration，重複執行會報物件已存在；不要刪表重跑。
3. 在 SQL Editor 單獨設定允許的 Google 帳號（此專案已依使用者確認設定唯一帳號；以下為重新安裝時的範例，替換為自己的 email，不要提交真實設定到 Git）：

   ```sql
   insert into cat_days_private.allowed_account (email)
   values (lower('YOUR_GOOGLE_EMAIL'))
   on conflict (singleton) do update set email = excluded.email;
   ```

4. Google Cloud Console 建立 OAuth 網頁應用程式，設定同意畫面、測試使用者或發佈狀態；只使用 `openid`、`email`、`profile`。授權來源為 `https://linhercherng.github.io`；授權重新導向 URI 使用 Supabase Google Provider 頁面顯示的 `https://PROJECT_REF.supabase.co/auth/v1/callback`。Google 測試模式可能需要把你的帳號加入測試使用者。
5. Supabase Authentication → Sign In / Providers → Google：填入 Google client ID、client secret 並啟用。Secret 只填在 Supabase 控制台。
6. Supabase Authentication → URL Configuration：Site URL 設為 `https://linhercherng.github.io/cat-days/`，Redirect URLs 加入完全相同網址。此專案已保存並重新載入確認。驗收 localhost 時另加該測試來源的根網址；不要使用全域萬用字元。
7. 提供 Supabase project URL 與 **publishable key**（`sb_publishable_...`）供網站設定；這兩項是公開前端設定。不要提供 `sb_secret_...`、`service_role`、access token 或資料庫密碼。新 key 可於 Project Settings → API Keys 取得。
8. 完成資料庫權限、Google Provider、返回網址及程式測試後，將 URL 與 publishable key 填進 `cloud-config.js`，部署 GitHub Pages 同步驗收版。此專案的正式根網址是唯一允許返回網址，因此真實 Google 回呼須在同步程式部署後驗證。先確認部署版本，再驗證指定帳號登入／讀寫及匿名拒絕；另一帳號的真實登入測試需由帳號持有人操作。允許 email 留在資料庫，不放前端。這一步尚不代表兩台電腦已驗收。
9. 首次登入 →「帳號與同步」→ 下載舊本機備份 → 確认下載成功 → 預覽 → 確認匯入。不要清除原本機記事。
10. 第二台電腦開啟同一網站、登入同一 Google 帳號，按「立即同步」，完成新增／修改／刪除驗收。

登入憑證只在記憶體；重新整理需再登入。頁面回到前景、每分鐘及保存後自動查變動。連線失敗保留草稿，請重試。Supabase 免費專案暫停時，先在 Dashboard 恢復服務。定期從「資料與備份」下載 JSON。

驗收時用新建的測試記事，避免刪除真實日記。相同編號衝突不覆蓋，已刪資料只保留最小同步標記。V2 備份包括此裝置草稿與刪除標記，没有登入憑證。

兩台電腦的完整操作與通過條件見 [同步驗收清單](cloud-acceptance.md)。

## 部署與回退

GitHub Pages 發布 `main` 根目錄，合併前記錄 `main` 的版本及合併提交。合併後核對 Pages 工作成功、線上 `app.js`／`cloud-config.js` 與提交內容一致，並在瀏覽器確認同步入口及真實 OAuth 回呼。既有本機記事不自動上傳。

若部署後出現登入、資料完整性或權限問題，停止匯入與正式記事操作，先保存裝置草稿／備份；修復或以 Git revert 回復網站合併提交，再核對 Pages 成功及線上版本。回退只修改網站，不刪除 Supabase 資料表、雲端記事或本機資料。舊本機版本無法顯示新雲端記事；修復同步版本後可再登入取得，不能把暫時不可見當成資料刪除。

回報設定完成時，只需說明已完成的步驟，並提供 project URL 和 publishable key。你可以在本機修改設定檔後告知完成；不必把秘密傳進對話。

官方來源：[Google 登入設定](https://supabase.com/docs/guides/auth/social-login/auth-google)、[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、[API keys](https://supabase.com/docs/guides/api/api-keys)、[方案費用](https://supabase.com/pricing)。
