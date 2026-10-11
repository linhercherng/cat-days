import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudStore, CloudConflict } from '../src/cloud-store.js';
const content = { date: '2026-10-11', text: '甲', mood: '', moodText: '' };
const at = '2026-10-11T00:00:00.000Z';
const record = (id, version, text = '甲') => ({ id, ...content, text, version, changeSeq: version, createdAt: at, updatedAt: at, deletedAt: null, originId: null });
function storage() { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; }
test('lost save response retries the same operation after reopening and keeps draft', async () => {
 const disk = storage(); let request; let attempts = 0;
 const rpc = async (name, args) => {
   if (name === 'cat_days_changes') return { records: [], cursor: 0, hasMore: false };
   if (!attempts++) { request = args; throw Error('network'); }
   assert.deepEqual(args, request); return { status: 'replayed', record: record(args.p_id,1) };
 };
 const a = createCloudStore({ owner: 'owner', storage: disk, rpc });
 const draft = await a.saveDraft({ id: 'new', slot: 'new', noteId: null, ...content });
 await assert.rejects(a.saveNote(content, null, draft));
 assert.equal(a.read().drafts.length,1);
 const b = createCloudStore({ owner: 'owner', storage: disk, rpc });
 await b.saveNote(content, null, b.read().drafts[0]);
 assert.equal(b.read().notes.length,1); assert.equal(b.read().drafts.length,0);
});
test('draft retains original version after background sync and reload', async () => {
 const disk = storage(); let latest = record('a',1); let writes = [];
 const rpc = async (name,args) => name === 'cat_days_changes'
   ? { records: [latest], cursor: latest.changeSeq, hasMore: false }
   : (writes.push(args), { status: 'conflict', record: latest });
 const a = createCloudStore({ owner:'owner',storage:disk,rpc }); await a.sync();
 await a.saveDraft({ id:'edit:a',slot:'edit',noteId:'a',...content,text:'草稿' });
 latest = record('a',2,'別台修改');
 const b = createCloudStore({ owner:'owner',storage:disk,rpc }); await b.sync();
 const d = b.read().drafts[0]; assert.equal(d.baseVersion,1);
 await assert.rejects(b.saveNote({...content,text:'草稿'}, {...b.read().notes[0], version:d.baseVersion},d),CloudConflict);
 assert.equal(writes[0].p_expected,1); assert.equal(b.read().drafts[0].text,'草稿');
});
test('tombstones remove notes while preserving device draft as explicit recovery', async () => {
 const disk = storage(); let latest = record('a',1);
 const a = createCloudStore({ owner:'owner',storage:disk,rpc:async()=>({records:[latest],cursor:latest.changeSeq,hasMore:false}) });
 await a.sync(); await a.saveDraft({id:'edit:a',slot:'edit',noteId:'a',...content});
 latest = {...record('a',2),date:null,text:null,mood:null,moodText:null,deletedAt:at};
 await a.sync(); assert.equal(a.read().notes.length,0); assert.equal(a.read().drafts[0].slot,'recovery');
 assert.equal(a.read().drafts[0].text,'甲');
 const other = createCloudStore({owner:'other',storage:disk,rpc:async()=>({records:[],cursor:0,hasMore:false})});
 assert.equal(other.read().drafts.length,0);
});
test('invalid server response does not advance cursor or remove notes', async () => {
 let response = {records:[record('a',1)],cursor:1,hasMore:false};
 const a = createCloudStore({owner:'owner',storage:storage(),rpc:async()=>response}); await a.sync();
 response={records:[{...record('a',2),text:42}],cursor:2,hasMore:false};
 await assert.rejects(a.sync()); assert.equal(a.read().notes[0].text,'甲');
});
test('a lost save followed by deletion keeps draft instead of reporting saved',async()=>{
 const disk=storage();let request,attempt=0;
 const rpc=async(_name,args)=>{if(!attempt++){request=args;throw Error('lost');}return {status:'replayed',record:{...record(request.p_id,2),date:null,text:null,mood:null,moodText:null,deletedAt:at}};};
 const a=createCloudStore({owner:'owner',storage:disk,rpc});
 const d=await a.saveDraft({id:'new',slot:'new',noteId:null,...content});
 await assert.rejects(a.saveNote(content,null,d));
 await assert.rejects(a.saveNote(content,null,d),CloudConflict);
 assert.equal(a.read().drafts[0].text,'甲');assert.equal(a.read().notes.length,0);
});
test('logout during a slow response cannot repopulate old account data',async()=>{
 let resolve;
 const a=createCloudStore({owner:'owner',storage:storage(),rpc:()=>new Promise(r=>{resolve=r;})});
 const pending=a.sync();await new Promise(r=>setImmediate(r));a.close();
 resolve({records:[record('a',1)],cursor:1,hasMore:false});
 await assert.rejects(pending,/登入/);assert.throws(()=>a.read(),/登入/);
});
test('editing input after an uncertain new save updates its confirmed ID, not a duplicate',async()=>{
 const disk=storage();let first,attempt=0;const requests=[];
 const rpc=async(_name,args)=>{
   requests.push(args);
   if(!attempt++){first=args;throw Error('lost response after commit');}
   if(args.p_operation===first.p_operation)return {status:'replayed',record:record(first.p_id,1)};
   assert.equal(args.p_id,first.p_id);assert.equal(args.p_expected,1);
   return {status:'saved',record:record(first.p_id,2,'修改後的輸入')};
 };
 const a=createCloudStore({owner:'owner',storage:disk,rpc});
 let d=await a.saveDraft({id:'new',slot:'new',noteId:null,...content});
 await assert.rejects(a.saveNote(content,null,d));
 d=await a.saveDraft({...d,text:'修改後的輸入'},d);
 const result=await a.saveNote({...content,text:'修改後的輸入'},null,d);
 assert.equal(result.id,first.p_id);assert.equal(a.read().notes.length,1);assert.equal(a.read().drafts.length,0);
});
test('confirmed new-save ID survives a failure before sending updated content',async()=>{
 const disk=storage(),originalSet=disk.setItem;let failUpdated=false,first,attempt=0;
 disk.setItem=(k,v)=>{if(failUpdated && JSON.parse(v).pending.some(p=>p.request.p_content?.text==='修改後的輸入')){failUpdated=false;throw Error('disk full');}originalSet(k,v);};
 const rpc=async(_name,args)=>{
   if(!attempt++){first=args;throw Error('lost');}
   if(args.p_operation===first.p_operation)return {status:'replayed',record:record(first.p_id,1)};
   assert.equal(args.p_id,first.p_id);assert.equal(args.p_expected,1);return {status:'saved',record:record(first.p_id,2,'修改後的輸入')};
 };
 const a=createCloudStore({owner:'owner',storage:disk,rpc});let d=await a.saveDraft({id:'new',slot:'new',noteId:null,...content});
 await assert.rejects(a.saveNote(content,null,d));
 d=await a.saveDraft({...d,text:'修改後的輸入'},d);failUpdated=true;
 await assert.rejects(a.saveNote({...content,text:'修改後的輸入'},null,d),/disk/);
 const b=createCloudStore({owner:'owner',storage:disk,rpc});const restored=b.read().drafts[0];
 assert.equal(restored.savedId,first.p_id);
 const saved=await b.saveNote({...content,text:'修改後的輸入'},null,restored);assert.equal(saved.id,first.p_id);assert.equal(b.read().drafts.length,0);
});
test('another tab changing draft content still blocks stale draft overwrite',async()=>{
 const disk=storage();const args={owner:'owner',storage:disk,rpc:async()=>{}};
 const a=createCloudStore(args),b=createCloudStore(args);
 const d=await a.saveDraft({id:'new',slot:'new',noteId:null,...content});
 await b.saveDraft({...d,text:'另一分頁'},d);
 await assert.rejects(a.saveDraft({...d,text:'本分頁'},d),/其他分頁/);
 assert.equal(a.read().drafts[0].text,'另一分頁');
});
