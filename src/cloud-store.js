import { note, draft, fields, emptyState, LIMIT } from './schema.js';
const same = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const positive = n => Number.isSafeInteger(n) && n > 0;
export function cloudRecord(value) {
  if (!value || !positive(value.version) || !positive(value.changeSeq)) throw Error('雲端資料版本不正確。');
  if (value.deletedAt !== null) {
    if (typeof value.id !== 'string' || !value.id || value.id.length > 128 || !/^\d{4}-\d{2}-\d{2}T/.test(value.deletedAt)
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
      s.drafts = s.drafts.map(d => { if (!Number.isSafeInteger(d.baseVersion) || d.baseVersion < 0) throw Error(); return {...draft(d),baseVersion:d.baseVersion}; });
      if (new Set(s.drafts.map(d=>d.id)).size !== s.drafts.length) throw Error();
      for (const p of s.pending) if (typeof p.fingerprint !== 'string' || !p.request || typeof p.request.p_operation !== 'string') throw Error();
      return s;
    } catch { throw Error('此帳號的裝置草稿格式損壞，已停止寫入；請下載原始資料。'); }
  }
  const change = task => lock(() => { assertActive(); const s=local(); const result=task(s); storage.setItem(key,JSON.stringify(s)); return result; });
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
        if (!page.hasMore) { records=next; cursor=after; return; }
      }
      throw Error('同步資料過多，請稍後重試。');
    });
  }
  async function write(action, noteId, expected, content, {restore=false, operation=null}={}) {
    return serial(async()=>{
      const fingerprint=JSON.stringify([action,noteId,expected,content ?? null,restore]);
      const request=await change(s=>{
        const previous=s.pending.find(p=>p.fingerprint===fingerprint);
        if (previous) return previous.request;
        const request={p_operation:operation || id(),p_action:action,p_id:noteId || id(),p_expected:expected,p_content:content ?? null,p_restore:restore};
        s.pending.push({fingerprint,request}); return request;
      });
      const reply=await rpc('cat_days_write',request); assertActive();
      if (!['saved','copy','skipped','replayed','deleted','conflict'].includes(reply?.status)) throw Error('保存回覆格式不正確，草稿仍保留。');
      const record=reply.record === null ? null : cloudRecord(reply.record);
      if (record) apply(record);
      if (reply.status === 'conflict' || reply.status === 'deleted') {
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
        if (same(current,expectedDraft)) s.drafts=s.drafts.filter(d=>d.id!==expectedDraft.id);
      }
      s.pending=s.pending.filter(p=>p.fingerprint!==reply.fingerprint);
    });
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
        if (!same(current,expected) && !(current && expected && same({...current,slot:expected.slot},expected))) throw Error('其他分頁已修改草稿；目前輸入保留。');
        const at=now(); const saved={...draft({...input,updatedAt:expected?.updatedAt >= at ? new Date(Date.parse(expected.updatedAt)+1).toISOString() : at}),baseVersion:expected?.baseVersion ?? records.get(input.noteId)?.version ?? 0};
        s.drafts=s.drafts.filter(d=>d.id!==saved.id); s.drafts.push(saved); return saved;
      });
    },
    discardDraft(expected){ return change(s=>{ const d=s.drafts.find(d=>d.id===expected.id); if (d && !same({...d,slot:expected.slot},expected)) throw Error('草稿已有其他分頁修改。'); s.drafts=s.drafts.filter(d=>d.id!==expected.id); }); },
    async saveNote(input,expected=null,expectedDraft=null){
      const reply=await write('save',expected?.id || null,expectedDraft?.baseVersion && expected ? expectedDraft.baseVersion : expected?.version || 0,fields(input));
      await finish(reply,expectedDraft); return reply.record;
    },
    async keepBoth(input,expectedDraft){ const reply=await write('save',null,0,fields(input)); await finish(reply,expectedDraft); return reply.record; },
    async deleteNote(expected){ const reply=await write('delete',expected.id,expected.version); await finish(reply,null); return reply.record; },
    async importNote(item,{restore=false,operation}={}){ const reply=await write('import',item.id,0,fields(item),{restore,operation}); if (reply.fingerprint) await finish(reply,null); return reply; }
  };
}
