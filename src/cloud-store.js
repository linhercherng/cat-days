import { note, draft, fields, emptyState, LIMIT, sameFields } from './schema.js';
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function sameDraft(current,expected) {
  if(!current || !expected)return same(current,expected);
  const comparable={...current,slot:expected.slot,baseVersion:expected.baseVersion};
  if(expected.savedId)comparable.savedId=expected.savedId;else delete comparable.savedId;
  return same(comparable,expected);
}
const positive = n => Number.isSafeInteger(n) && n > 0;
export function cloudRecord(value) {
  if (!value || !positive(value.version) || !positive(value.changeSeq)) throw Error('雲端資料版本不正確。');
  if (value.deletedAt !== null) {
    if (typeof value.id !== 'string' || !value.id || value.id.length > 128 || typeof value.deletedAt !== 'string' || Number.isNaN(Date.parse(value.deletedAt)) || new Date(value.deletedAt).toISOString() !== value.deletedAt
      || ['date','text','mood','moodText'].some(k => value[k] !== null)) throw Error('雲端刪除標記不正確。');
    return { id:value.id, version:value.version, changeSeq:value.changeSeq, deletedAt:value.deletedAt };
  }
  return {...note({...value, ...(value.originId === null ? {originId:undefined} : {})}), version:value.version,changeSeq:value.changeSeq,deletedAt:null};
}
export class CloudConflict extends Error {
  constructor(record) { super(record?.deletedAt ? '這筆記事已在其他裝置刪除。目前草稿仍保留，可另存為新記事。' : '這筆記事已有雲端新版本，目前輸入仍保留。請選擇保留兩份或使用雲端版本。'); this.record = record; this.name = 'CloudConflict'; }
}
export function createCloudStore({owner,storage,rpc,lock = async fn=>fn(),now=()=>new Date().toISOString(),id=()=>crypto.randomUUID()}) {
  if (typeof owner !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(owner)) throw Error('帳號識別不正確。');
  const key = `cat-days:cloud:${owner}:drafts:v1`;
  let records = new Map(), cursor = 0, queue = Promise.resolve(), active = true;
  const assertActive = () => { if (!active) throw Error('請先登入原本的帳號，草稿仍留在此裝置。'); };
  function local() {
    const raw = storage.getItem(key);
    if (raw === null) return {version:1,drafts:[],pending:[]};
    try {
      const s = JSON.parse(raw);
      if (s.version !== 1 || !Array.isArray(s.drafts) || s.drafts.length > LIMIT || !Array.isArray(s.pending) || s.pending.length > LIMIT) throw Error();
      s.drafts = s.drafts.map(d => { if (!Number.isSafeInteger(d.baseVersion) || d.baseVersion < 0 || (d.savedId!==undefined && (typeof d.savedId!=='string' || !d.savedId || d.savedId.length>128))) throw Error(); return {...draft(d),baseVersion:d.baseVersion,...(d.savedId ? {savedId:d.savedId} : {})}; });
      if (new Set(s.drafts.map(d=>d.id)).size !== s.drafts.length) throw Error();
      for (const p of s.pending) {
        const r=p.request;
        if (typeof p.fingerprint !== 'string' || !r || !/^[0-9a-f-]{36}$/i.test(r.p_operation) || !['save','delete','import','copy','marker'].includes(r.p_action)
          || typeof r.p_id !== 'string' || !r.p_id || r.p_id.length>128 || !Number.isSafeInteger(r.p_expected) || r.p_expected<0 || typeof r.p_restore!=='boolean') throw Error();
        if(!['delete','marker'].includes(r.p_action))fields(r.p_content);
      }
      return s;
    } catch { throw Error('此帳號的裝置草稿格式損壞，已停止寫入；請下載原始資料。'); }
  }
  const change = task => lock(() => { assertActive(); const s=local(); const result=task(s); if(s.drafts.length>LIMIT || s.pending.length>LIMIT)throw Error('此帳號草稿或待確認操作已達上限，請先備份並整理。'); storage.setItem(key,JSON.stringify(s)); return result; });
  const serial = task => { const next=queue.then(()=>{ assertActive(); return task(); }); queue=next.catch(()=>{}); return next; };
  const apply = record => { const previous=records.get(record.id); if (!previous || previous.changeSeq <= record.changeSeq) records.set(record.id,record); };
  async function sync() {
    return serial(async () => {
      const next = new Map(records); let after = cursor;
      for (let pages=0; pages<10000; pages++) {
        const page=await rpc('cat_days_changes',{p_after:after,p_limit:200}); assertActive();
        if (!page || !Array.isArray(page.records) || page.records.length > 200 || !Number.isSafeInteger(page.cursor) || page.cursor < after || typeof page.hasMore !== 'boolean') throw Error('同步回覆格式不正確。');
        let last=after;
        for (const value of page.records) { const record=cloudRecord(value); if (record.changeSeq <= last || record.changeSeq > page.cursor) throw Error('同步順序不正確。'); last=record.changeSeq; next.set(record.id,record); }
        if (page.cursor !== last || (page.hasMore && !page.records.length)) throw Error('同步游標不正確。');
        after=page.cursor;
        if (!page.hasMore) { const changed=cursor!==after; records=next; cursor=after; return changed; }
      }
      throw Error('同步資料過多，請稍後重試。');
    });
  }
  async function write(action, noteId, expected, content, {restore=false, operation=null,draftId=null,resume=null}={}) {
    return serial(async()=>{
      const fingerprint=resume?.fingerprint || JSON.stringify([action,noteId,expected,content ?? null,restore,draftId]);
      const request=await change(s=>{
        const previous=s.pending.find(p=>p.fingerprint===fingerprint);
        if (previous) return previous.request;
        if(resume)throw Error('其他分頁已處理這次保存，請重新確認記事。');
        const request={p_operation:operation || id(),p_action:action,p_id:noteId || id(),p_expected:expected,p_content:content ?? null,p_restore:restore};
        s.pending.push({fingerprint,request,draftId}); return request;
      });
      const reply=await rpc('cat_days_write',request); assertActive();
      if (!['saved','copy','skipped','replayed','deleted','conflict'].includes(reply?.status)) throw Error('保存回覆格式不正確，草稿仍保留。');
      const record=reply.record === null ? null : cloudRecord(reply.record);
      const validId=action==='copy' ? record?.id===`copy:${request.p_operation}` : action==='import' ? record?.id===request.p_id || record?.id===`copy:${request.p_operation}` : record?.id===request.p_id;
      if(record && !validId) throw Error('雲端回覆的記事編號不符，草稿仍保留。');
      if(reply.status==='saved' && action==='delete' && !record?.deletedAt)throw Error('雲端未確認刪除。');
      if (record) apply(record);
      if (reply.status === 'conflict' || reply.status === 'deleted' || (record?.deletedAt && !['delete','marker'].includes(action))) {
        await change(s=>{ s.pending=s.pending.filter(p=>p.fingerprint!==fingerprint); });
        if (action==='import') return reply;
        throw new CloudConflict(record);
      }
      if (!record) throw Error('雲端未確認保存，草稿仍保留。');
      // Keep receipt locally until draft cleanup succeeds, so an uncertain result can be retried.
      return {...reply,record,fingerprint};
    });
  }
  async function finish(reply, expectedDraft) {
    await change(s=>{
      if (expectedDraft) {
        const current=s.drafts.find(d=>d.id===expectedDraft.id);
        if (current && sameDraft(current,expectedDraft)) s.drafts=s.drafts.filter(d=>d.id!==expectedDraft.id);
      }
      s.pending=s.pending.filter(p=>p.fingerprint!==reply.fingerprint);
    });
  }
  async function resumeSave(draftId) {
    const pending=local().pending.find(p=>p.draftId===draftId && ['save','copy'].includes(p.request.p_action));
    if(!pending)return null;
    const r=pending.request;
    const reply=await write(r.p_action,r.p_id,r.p_expected,r.p_content,{resume:pending,draftId});
    // A later device edit must still produce a conflict, even when our earlier save succeeded.
    if(reply.record.version!==r.p_expected+1){await finish(reply,null);throw new CloudConflict(reply.record);}
    await change(s=>{
      const d=s.drafts.find(d=>d.id===draftId);
      if(d){d.savedId=reply.record.id;d.baseVersion=reply.record.version;}
      s.pending=s.pending.filter(p=>p.fingerprint!==reply.fingerprint);
    });
    return reply;
  }
  return {
    kind:'cloud', owner, key, sync,
    close(){ active=false; records.clear(); cursor=0; },
    raw(){ return storage.getItem(key); },
    read(){
      assertActive(); const s=local();
      return {...emptyState(),noticeShown:true,notes:[...records.values()].filter(n=>!n.deletedAt).map(n=>({...n})),
        drafts:s.drafts.map(d=> d.slot==='edit' && !records.get(d.noteId)?.deletedAt && records.has(d.noteId) ? {...d} : d.slot==='edit' ? {...d,slot:'recovery'} : {...d})};
    },
    records(){ return [...records.values()].map(n=>({...n})); },
    saveDraft(input,expected=null){
      return change(s=>{
        const current=s.drafts.find(d=>d.id===input.id);
        // A deleted note is presented as recovery; its stored slot remains edit.
        if (!sameDraft(current,expected)) throw Error('其他分頁已修改草稿；目前輸入保留。');
        const at=now(),savedId=current?.savedId || expected?.savedId; const saved={...draft({...input,updatedAt:expected?.updatedAt >= at ? new Date(Date.parse(expected.updatedAt)+1).toISOString() : at}),baseVersion:current?.baseVersion ?? expected?.baseVersion ?? records.get(input.noteId)?.version ?? 0,...(savedId ? {savedId} : {})};
        s.drafts=s.drafts.filter(d=>d.id!==saved.id); s.drafts.push(saved); return saved;
      });
    },
    discardDraft(expected){ return change(s=>{ const d=s.drafts.find(d=>d.id===expected.id); if (d && !sameDraft(d,expected)) throw Error('草稿已有其他分頁修改。'); s.drafts=s.drafts.filter(d=>d.id!==expected.id); }); },
    async saveNote(input,expected=null,expectedDraft=null){
      const content=fields(input),draftId=expectedDraft?.id || expected?.id || 'new';
      const previous=await resumeSave(draftId);
      if(previous && sameFields(previous.record,content)){await finish(previous,expectedDraft);return previous.record;}
      const target=previous?.record || expected || (expectedDraft?.savedId ? {id:expectedDraft.savedId,version:expectedDraft.baseVersion} : null);
      const version=previous ? target.version : expectedDraft?.baseVersion && target ? expectedDraft.baseVersion : target?.version || 0;
      const reply=await write('save',target?.id || null,version,content,{draftId});
      await finish(reply,expectedDraft); return reply.record;
    },
    async keepBoth(input,expectedDraft,originId){
      const content=fields(input),draftId=expectedDraft?.id || originId || 'new';
      const previous=await resumeSave(draftId);
      if(previous && sameFields(previous.record,content)){await finish(previous,expectedDraft);return previous.record;}
      const reply=previous ? await write('save',previous.record.id,previous.record.version,content,{draftId}) : await write('copy',originId || expectedDraft?.noteId || id(),0,content,{draftId});
      await finish(reply,expectedDraft);return reply.record;
    },
    async deleteNote(expected){ const reply=await write('delete',expected.id,expected.version); await finish(reply,null); return reply.record; },
    async importNote(item,{restore=false,operation}={}){ const reply=await write('import',item.id,0,fields(item),{restore,operation}); if (reply.fingerprint) await finish(reply,null); return reply; },
    async importTombstone(item,operation){ const reply=await write('marker',item.id,0,null,{operation}); await finish(reply,null); return reply; }
  };
}
