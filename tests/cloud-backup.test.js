import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCloudBackup,previewCloudImport,importOperation} from '../src/cloud-backup.js';
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
