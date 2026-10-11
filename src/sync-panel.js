import {$,el,button,download,link} from './dom.js';
import {validCloudConfig,createCloudAuth} from './cloud-auth.js';
import {createCloudStore} from './cloud-store.js';
import {makeBackup} from './backup.js';
import {previewCloudImport,importCloudBackup} from './cloud-backup.js';
export function createSyncPanel({config,storage,localStore,setCloud,status,ask,guard,onUpdate}) {
  let auth=null,cloud=null,user=null,pending=false,syncing=false,message='尚未登入 · 使用本機記事',lastSync=null;
  const setMessage=value=>{message=value;const p=$('#sync-status');if(p)p.textContent=value;const global=$('#cloud-status');global.hidden=!cloud;global.textContent=cloud?value:'';};
  async function connect(){
    user=await auth.user();if(!user)return;
    if(await auth.rpc('cat_days_allowed')!==true){await auth.logout();user=null;throw Error('此 Google 帳號未獲允許。請改用指定帳號；本機記事仍保留。');}
    const store=createCloudStore({owner:user.id,storage,rpc:auth.rpc,lock:fn=>navigator.locks?navigator.locks.request(`cat-days-cloud-${user.id}`,fn):fn()});
    // Do not expose cloud mode until the initial authorized read succeeds.
    try{await store.sync();}catch(e){store.close();throw e;}
    cloud=store;cloud.email=user.email;setCloud(cloud);lastSync=new Date();setMessage('已同步 · 草稿只在這台裝置');onUpdate();
  }
  async function initialize(){
    if(!validCloudConfig(config)){render();return;}
    try{auth=await createCloudAuth(config);if(await auth.callback())await connect();}catch(e){setMessage(e.message);status(e.message);}
    render();
  }
  async function sync({quiet=false}={}) {
    if(!cloud || pending || syncing || document.hidden)return;
    syncing=true;setMessage('正在同步…');
    try{const changed=await cloud.sync();lastSync=new Date();setMessage('已同步 · 草稿只在這台裝置');if(changed)onUpdate();if(!quiet)status('已取得雲端最新記事。');}
    catch(e){setMessage(`同步失敗 · ${e.message}`);if(!quiet)status(e.message);}finally{syncing=false;}
  }
  function render(){
    const container=$('#sync-content');container.replaceChildren();
    const card=el('div',{class:'data-card'},el('h2',{},cloud?'目前的雲端帳號':'跨裝置的小日子'),el('p',{id:'sync-status',role:'status'},message));
    if(!validCloudConfig(config))card.append(el('p',{},'雲端程式已準備，尚未連接 Supabase 與 Google 登入。本機記事與備份仍可使用。'),link('雲端設定步驟','./docs/cloud-setup.md'));
    else if(!cloud)card.append(el('p',{},'使用指定的 Google 帳號。登入後不會自動上傳舊本機記事。重新整理需再登入；雲端記事與裝置草稿仍保留。'),button('使用 Google 登入',async()=>{
      if(!await guard())return;
      try{auth ||= await createCloudAuth(config);await auth.login();}catch(e){setMessage(e.message);status(e.message);}
    },'primary'));
    else {
      card.append(el('p',{class:'account-email'},user.email||'已驗證 Google 帳號'),el('p',{},lastSync?`上次同步：${lastSync.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`:''),button('立即同步',()=>sync(),'primary'),button('登出此裝置',async()=>{
        if(pending || !await guard())return;
        const count=cloud.read().drafts.length;
        if(!await ask('登出這台裝置？',`雲端記事將隱藏。${count} 份草稿留在此裝置，需登入相同帳號才能繼續。本機原記事保留。`,'登出'))return;
        const old=cloud;cloud=null;user=null;old.close();setCloud(null);onUpdate();
        try{await auth.logout();setMessage('已登出 · 使用本機記事');}catch(e){setMessage(e.message);}render();
      }));
    }
    container.append(card);
    if(!cloud)return;
    let legacy;try{legacy=localStore.read();}catch(e){container.append(el('p',{role:'alert'},e.message));return;}
    const importCard=el('div',{class:'data-card'},el('h2',{},'將舊本機記事匯入這個帳號'),el('p',{},`${legacy.notes.length} 筆本機記事。原資料保留；本機草稿不會自動上傳。`));
    const preview=el('div',{'aria-live':'polite'});
    let backedUp=false;
    importCard.append(button('1. 下載舊本機備份',()=>{try{download(makeBackup(localStore.read()),`cat-days-local-backup-${Date.now()}.json`);backedUp=true;status('請確認下載成功並妥善保存，再預覽匯入。');}catch(e){status(e.message);}},'primary'),button('2. 預覽記事匯入',async()=>{
      if(!backedUp){status('請先下載本機備份。');return;}
      try{
        await cloud.sync();const incoming={...makeBackup(localStore.read()),drafts:[]};
        const c=previewCloudImport(cloud.records(),incoming);
        preview.replaceChildren(el('p',{},`匯入帳號：${user.email}`),el('p',{},`新增 ${c.added}（含副本 ${c.copies}）· 相同略過 ${c.skipped} · 已刪略過 ${c.deleted}`));
        const confirm=button('3. 確認匯入記事',async()=>{
          if(!await ask('匯入到這個帳號？',`${user.email}\n只匯入正式記事；不刪除原本機記事。`,'確認匯入'))return;
          confirm.disabled=true;pending=true;
          try{const result=await importCloudBackup(cloud,incoming,{progress:c=>setMessage(`已確認 ${c.saved+c.skipped+c.deleted}／${c.total} 筆`)});setMessage(`匯入完成：新增 ${result.saved}、略過 ${result.skipped}、已刪略過 ${result.deleted}`);onUpdate();render();}
          catch(e){setMessage(e.message);confirm.disabled=false;}finally{pending=false;}
        },'primary');preview.append(confirm);
      }catch(e){status(e.message);}
    }),preview);
    container.append(importCard,el('p',{class:'small'},'草稿只在本裝置；離線不正式保存。衝突不覆蓋，刪除會同步。免費雲端服務可能因低活動而暫停，請定期備份。'),link('資料與備份','#data'));
  }
  window.addEventListener('focus',()=>sync({quiet:true}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync({quiet:true});});
  window.addEventListener('online',()=>{sync({quiet:true});status('網路已恢復。未保存的草稿需自行按「儲存記事」。');});
  window.addEventListener('offline',()=>{if(cloud)setMessage('目前離線 · 草稿可繼續寫，正式保存需連線');});
  setInterval(()=>sync({quiet:true}),60000);
  return {render,initialize,sync,isBusy:()=>pending,setBusy:value=>{pending=value;},changed(){if(cloud)sync({quiet:true});},storageKey:()=>cloud?.key};
}
