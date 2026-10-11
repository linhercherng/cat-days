import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCloudBackup,makeCloudBackup,previewCloudImport,importCloudBackup,importOperation} from '../src/cloud-backup.js';
import {makeBackup} from '../src/backup.js';
import {createCloudStore} from '../src/cloud-store.js';
import {emptyState} from '../src/schema.js';
const at='2026-10-11T00:00:00.000Z';
const note={id:'a',date:'2026-10-11',text:'原稿',mood:'',moodText:'',createdAt:at,updatedAt:at};
test('cloud import skips tombstones by default, explicit restore makes a new copy',()=>{
 const incoming={notes:[note],drafts:[]};
 const records=[{id:'a',deletedAt:at}];
 assert.deepEqual(previewCloudImport(records,incoming),{added:0,skipped:0,copies:0,deleted:1,drafts:0});
 assert.equal(previewCloudImport(records,incoming,{restore:true}).copies,1);
});
test('distinct IDs remain distinct, repeated imported copy can be skipped',()=>{
 const incoming={notes:[note],drafts:[]};
 assert.equal(previewCloudImport([{...note,id:'other'}],incoming).added,1);
 assert.equal(previewCloudImport([{...note,id:'copy',originId:'a'}],incoming).skipped,1);
});
test('V1 compatibility, V2 tombstone preservation and duplicate rejection',()=>{
 const v1={app:'cat-days',version:1,exportedAt:at,notes:[note],drafts:[]};
 assert.equal(parseCloudBackup(JSON.stringify(v1)).notes.length,1);
 const v2={...v1,version:2,tombstones:[{id:'deleted',version:2,deletedAt:at}]};
 assert.equal(parseCloudBackup(JSON.stringify(v2)).tombstones[0].id,'deleted');
 assert.throws(()=>parseCloudBackup(JSON.stringify({...v2,tombstones:[{id:'a',version:2,deletedAt:at}]})));
});
test('import retries get stable IDs, different account or content gets a different ID',async()=>{
 const a=await importOperation('owner',note); assert.equal(a,await importOperation('owner',note));
 assert.notEqual(a,await importOperation('other',note));assert.notEqual(a,await importOperation('owner',{...note,text:'新版'}));
});
for(const version of [1,2])test(`V${version} backup restores into isolated cloud store and re-exports as V2`,async()=>{
 const disk=new Map(),server=new Map();let sequence=0;
 const store=createCloudStore({owner:'roundtrip-test',storage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)},rpc:async(name,args)=>{
   assert.equal(name,'cat_days_write');
   const marker=args.p_action==='marker';
   const record=marker?{id:args.p_id,date:null,text:null,mood:null,moodText:null,createdAt:at,updatedAt:at,deletedAt:at,version:1,changeSeq:++sequence}
     :{id:args.p_id,...args.p_content,createdAt:at,updatedAt:at,deletedAt:null,version:1,changeSeq:++sequence};
   server.set(record.id,record);return {status:'saved',record};
 }});
 const current={...emptyState(),notes:[note],drafts:[{id:'new',slot:'new',noteId:null,date:'',text:'未完成貓🙂',mood:'',moodText:'',updatedAt:at}]};
 const source={read:()=>current,records:()=>[note,{id:'deleted',version:1,deletedAt:at}]};
 const before=JSON.stringify(current);
 const value=version===1?makeBackup(current):makeCloudBackup(source);
 const incoming=parseCloudBackup(JSON.stringify(value,null,2));
 const counts=await importCloudBackup(store,incoming);
 assert.equal(counts.saved,1);assert.equal(counts.drafts,1);
 assert.equal(server.size,version===1?1:2);
 const restored=parseCloudBackup(JSON.stringify(makeCloudBackup(store),null,2));
 assert.deepEqual(restored.notes,[note]);
 assert.equal(restored.drafts[0].text,current.drafts[0].text);
 assert.equal(restored.drafts[0].slot,'recovery');
 assert.equal(restored.tombstones.length,version===1?0:1);
 assert.equal(JSON.stringify(current),before);
});
