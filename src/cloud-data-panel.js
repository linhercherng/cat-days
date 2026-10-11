import {$,el,button,link,download} from './dom.js';
import {makeCloudBackup,parseCloudBackup,previewCloudImport,importCloudBackup} from './cloud-backup.js';
import {MAX_BACKUP_BYTES} from './backup.js';
export function createCloudDataPanel(store,{ask,status,onBusy=()=>{}}) {
  let generation=0;
  function render() {
    const token=++generation, container=$('#data-content'); container.replaceChildren();
    container.append(el('div',{class:'data-card'},el('h2',{},'雲端記事 · 裝置草稿'),el('p',{class:'account-email'},store.email || '目前登入帳號'),el('p',{},'正式記事使用登入帳號同步；草稿只在這台裝置。備份沒有加密，請安全保管。'),link('帳號與同步','#sync')));
    let state; try {state=store.read();} catch(e) {container.append(el('p',{role:'alert'},e.message),button('下載此帳號草稿原始檔',()=>download(store.raw(),'cat-days-drafts-recovery.json',true)));return;}
    container.append(el('div',{class:'data-card'},el('h2',{},'下載雲端備份'),el('p',{},`${state.notes.length} 筆記事 · ${state.drafts.length} 份裝置草稿`),button('同步後下載 JSON 備份',async()=>{
      onBusy(true);
      try {await store.sync();download(makeCloudBackup(store),`cat-days-cloud-backup-${Date.now()}.json`);status('雲端 V2 備份已產生，包含刪除標記與這台裝置草稿。');}catch(e){status(e.message);}finally{onBusy(false);}
    },'primary')));
    const file=el('input',{id:'cloud-backup-file',type:'file',accept:'.json,application/json'}),preview=el('div',{'aria-live':'polite'});
    container.append(el('div',{class:'data-card'},el('h2',{},'還原到目前帳號'),el('p',{},'支援 V1／V2。預覽後逐筆合併，重試不重複新增；備份的刪除標記不會刪除現有雲端記事。'),el('label',{for:'cloud-backup-file'},'選擇 JSON 備份（最多 5 MB）'),file,preview));
    file.addEventListener('change',async()=>{
      preview.replaceChildren();const selected=file.files[0];if(!selected)return;
      try {
        if(selected.size>MAX_BACKUP_BYTES)throw Error('備份檔不得超過 5 MB。');
        const incoming=parseCloudBackup(await selected.text());if(token!==generation)return;
        await store.sync();if(token!==generation)return;
        const restore=el('input',{type:'checkbox',id:'cloud-restore-deleted'});
        const counts=el('p',{}),progress=el('p',{role:'status'});
        const update=()=>{const c=previewCloudImport(store.records(),incoming,{restore:restore.checked});counts.textContent=`預估新增 ${c.added} 筆（含副本 ${c.copies}）· 相同略過 ${c.skipped} · 已刪略過 ${c.deleted} · 草稿 ${c.drafts} 份`;};
        restore.addEventListener('change',update);update();
        const confirm=button('確認合併到雲端',async()=>{
          if(!await ask('匯入到目前登入帳號？',`${store.email || '目前帳號'}\n雲端保留原稿。已刪 ID 預設略過；若勾選恢復，將建立新 ID 的副本。草稿只加入這台裝置。`,'確認匯入'))return;
          confirm.disabled=true;restore.disabled=true;file.disabled=true;onBusy(true);
          try {const c=await importCloudBackup(store,incoming,{restore:restore.checked,progress:c=>{progress.textContent=`已確認 ${c.saved+c.skipped+c.deleted}／${c.total} 筆`;}});render();status(`匯入完成：新增 ${c.saved}、略過 ${c.skipped}、已刪略過 ${c.deleted}、裝置草稿 ${c.drafts}。`);}
          catch(e){progress.textContent=e.message;confirm.disabled=false;restore.disabled=false;file.disabled=false;}finally{onBusy(false);}
        },'primary');
        preview.append(counts,el('label',{class:'checkbox-label'},restore,'將已刪記事恢復為新記事（不復活原 ID）'),el('p',{class:'small'},'預覽後雲端仍可能變動，保存時會再檢查。副本包含在新增數量。'),confirm,progress);
      } catch(e){if(token===generation)preview.replaceChildren(el('p',{class:'error-banner',role:'alert'},e.message));}
    });
    const drafts=el('div',{class:'data-card'},el('h2',{},'此帳號在這台裝置的草稿'));
    if(!state.drafts.length)drafts.append(el('p',{},'目前沒有草稿。'));
    for(const d of state.drafts)drafts.append(el('div',{class:'draft-item'},el('p',{},`${d.date||'未選日期'} · ${d.slot==='recovery'?'另存新記事的草稿':'尚未完成'}`),el('p',{class:'draft-excerpt'},(d.text||d.moodText||d.mood||'空白').slice(0,120)),link('查看／繼續草稿',d.slot==='new'?'#editor':d.slot==='edit'?`#editor?id=${encodeURIComponent(d.noteId)}`:`#editor?draft=${encodeURIComponent(d.id)}`)));
    container.append(drafts);
  }
  return {render};
}
