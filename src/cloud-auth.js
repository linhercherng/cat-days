import { authStorage } from './auth-storage.js';
import { timedFetch } from './network.js';
export function validCloudConfig(config) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config?.url || '') && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config?.publishableKey || '');
}
export async function createCloudAuth(config) {
  if (!validCloudConfig(config)) throw Error('雲端尚未設定；本機記事功能仍可使用。');
  const {createClient}=await import('../assets/vendor/supabase.js');
  const storage=authStorage(window.sessionStorage);
  const client=createClient(config.url,config.publishableKey,{global:{fetch:timedFetch(window.fetch.bind(window))},auth:{storage,storageKey:'cat-days-auth',persistSession:true,flowType:'pkce',detectSessionInUrl:false,autoRefreshToken:true}});
  const rpc=async (name,args={})=>{
    if (!navigator.onLine) throw Error('目前離線。草稿仍在此裝置，連線後請再按一次儲存。');
    const {data,error}=await client.rpc(name,args);
    if (error) {
      if (error.message?.includes('FORBIDDEN') || ['401','PGRST301','PGRST303'].includes(error.code)) throw Error('登入已失效或此帳號未獲允許。草稿仍保留，請重新登入指定帳號。');
      if (error.message?.includes('NOTE_LIMIT')) throw Error('雲端記事已達 5,000 筆，請先備份並整理。');
      throw Error('雲端未確認操作成功，可能是網路或服務暫停。草稿仍保留，請稍後重試。');
    }
    return data;
  };
  return {
    rpc,
    async user() { const {data,error}=await client.auth.getUser(); return error ? null : data.user; },
    async callback() {
      const url=new URL(location.href),code=url.searchParams.get('code'),failure=url.searchParams.get('error');
      if (!code && !failure) return false;
      url.searchParams.delete('code'); ['error','error_description','error_code'].forEach(k=>url.searchParams.delete(k));
      url.hash='#sync'; history.replaceState(null,'',url);
      if (failure) { storage.removeItem('cat-days-auth-code-verifier'); throw Error('Google 登入未完成，請重試。'); }
      const {error}=await client.auth.exchangeCodeForSession(code);
      storage.removeItem('cat-days-auth-code-verifier');
      if (error) throw Error('登入驗證已過期或不是從此分頁開始，請重新 Google 登入。');
      return true;
    },
    async login() {
      const redirect=new URL('./',location.href); redirect.search=''; redirect.hash='';
      const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href,scopes:'openid email profile',queryParams:{prompt:'select_account'}}});
      if (error) throw Error('無法開啟 Google 登入，請檢查連線與雲端設定。');
    },
    async logout() {
      // Local sign-out must hide data even when revocation cannot reach the server.
      const {error}=await client.auth.signOut({scope:'local'});
      storage.clear(); client.auth.stopAutoRefresh();
      if (error) throw Error('此裝置已清除登入；伺服器登出未確認。重新整理後需再次登入。');
    }
  };
}
