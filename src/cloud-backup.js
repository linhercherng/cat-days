import {backup, draft, note, sameFields, LIMIT} from './schema.js';
import {MAX_BACKUP_BYTES} from './backup.js';
import {cloudRecord} from './cloud-store.js';
export function parseCloudBackup(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw Error('備份檔不得超過 5 MB。');
  let value; try {value=JSON.parse(raw);} catch {throw Error('無法讀取 JSON 備份。');}
  if (value?.version === 1) return backup(value);
  if (value?.app !== 'cat-days' || value.version !== 2 || !Array.isArray(value.notes) || !Array.isArray(value.tombstones) || !Array.isArray(value.drafts)
    || value.notes.length > LIMIT || value.drafts.length > LIMIT || value.tombstones.length > 50000
    || typeof value.exportedAt !== 'string' || new Date(value.exportedAt).toISOString() !== value.exportedAt) throw Error('不是支援的貓咪手帳備份。');
  const notes=value.notes.map(note),drafts=value.drafts.map(draft);
  const tombstones=value.tombstones.map(t=>{ if (!t || typeof t.id !== 'string' || !t.id || t.id.length>128 || !Number.isSafeInteger(t.version) || t.version<1
    || typeof t.deletedAt !== 'string' || new Date(t.deletedAt).toISOString()!==t.deletedAt) throw Error('刪除標記格式不正確。'); return {id:t.id,version:t.version,deletedAt:t.deletedAt}; });
  if (new Set([...notes,...tombstones].map(n=>n.id)).size !== notes.length+tombstones.length || new Set(drafts.map(d=>d.id)).size !== drafts.length) throw Error('備份記錄編號重複。');
  return {app:'cat-days',version:2,exportedAt:value.exportedAt,notes,drafts,tombstones};
}
export function makeCloudBackup(store) {
  return {app:'cat-days',version:2,exportedAt:new Date().toISOString(),notes:store.read().notes.map(note),
    tombstones:store.records().filter(n=>n.deletedAt).map(({id,version,deletedAt})=>({id,version,deletedAt})),drafts:store.read().drafts.map(draft)};
}
export function previewCloudImport(records,incoming,{restore=false}={}) {
  const sourceIds=new Set(incoming.notes.map(n=>n.id));
  const counts={added:0,skipped:0,copies:0,deleted:0,drafts:incoming.drafts.length};
  for (const n of incoming.notes) {
    const existing=records.find(r=>r.id===n.id);
    if (existing?.deletedAt) { if (restore) {counts.added++;counts.copies++;} else counts.deleted++; }
    else if (records.some(r=>!r.deletedAt && (r.id===n.id || (r.originId===n.id && !sourceIds.has(r.id))) && sameFields(r,n))) counts.skipped++;
    else {counts.added++; if (existing) counts.copies++;}
  }
  return counts;
}
export async function importOperation(owner,item,restore=false) {
  const bytes=new TextEncoder().encode(JSON.stringify(['cat-days-import-v1',owner,item.id,item.date,item.text,item.mood,item.moodText,restore]));
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  digest[6]=(digest[6]&15)|80; digest[8]=(digest[8]&63)|128;
  const hex=[...digest.slice(0,16)].map(n=>n.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function importCloudBackup(store,incoming,{restore=false,progress=()=>{}}={}) {
  const counts={saved:0,skipped:0,copies:0,deleted:0,drafts:0,total:incoming.notes.length};
  for(const marker of incoming.tombstones || []) {
    await store.importTombstone(marker,await importOperation(store.owner,{id:`marker:${marker.id}`,date:'',text:'',mood:'',moodText:''}));
  }
  for (const item of incoming.notes) {
    try {
      const reply=await store.importNote(item,{restore,operation:await importOperation(store.owner,item,restore)});
      if (reply.status==='deleted' || reply.record?.deletedAt) counts.deleted++;
      else if (reply.status==='skipped' || reply.status==='replayed') counts.skipped++;
      else {counts.saved++;if(reply.status==='copy') counts.copies++;}
      progress({...counts});
    } catch(e) {e.message=`已確認 ${counts.saved+counts.skipped+counts.deleted}／${counts.total} 筆；${e.message} 請保留同一份備份，重新預覽後重試。`;throw e;}
  }
  for (const item of incoming.drafts) {
    const id=`import:${await importOperation(store.owner,{...item,id:`draft:${item.id}`})}`;
    const current=store.read().drafts.find(d=>d.id===id);
    if (!current) {await store.saveDraft({...item,id,slot:'recovery',noteId:null,originId:item.id});counts.drafts++;}
  }
  return counts;
}
