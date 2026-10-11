import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudDataPanel} from '../src/cloud-data-panel.js';
import {parseCloudBackup} from '../src/cloud-backup.js';
import {MAX_BACKUP_BYTES} from '../src/backup.js';
import {installDOM} from './helpers/dom.js';

const at='2026-10-11T00:00:00.000Z';
const note={id:'a',date:'2026-10-11',text:'貓🙂',mood:'',moodText:'',createdAt:at,updatedAt:at};
function fixture(t, notes=[note]) {
  const dom=installDOM(t),messages=[],busy=[],blobs=[];
  let syncs=0;
  const state={notes,drafts:[]};
  const store={kind:'cloud',email:'test@example.invalid',read:()=>state,records:()=>notes,sync:async()=>{syncs++;}};
  t.mock.method(URL,'createObjectURL',blob=>{blobs.push(blob);return 'blob:test';});
  t.mock.method(globalThis,'setTimeout',()=>0);
  createCloudDataPanel(store,{ask:async()=>true,status:m=>messages.push(m),onBusy:v=>busy.push(v)}).render();
  const file=dom.find(dom.get('#data-content'),n=>n.attrs.id==='cloud-backup-file');
  return {dom,messages,busy,blobs,state,syncs:()=>syncs,
    select:async selected=>{file.files=[selected];await file.emit('change');},
    download:()=>dom.button('#data-content','同步後下載 JSON 備份').click()};
}
test('cloud download produces the actual formatted UTF-8 Blob accepted by V2 restore',async t=>{
  const f=fixture(t);
  await f.download();
  assert.equal(f.syncs(),1);
  assert.equal(f.blobs.length,1);
  const raw=await f.blobs[0].text();
  assert.equal(f.blobs[0].size,Buffer.byteLength(raw));
  assert.deepEqual(parseCloudBackup(raw).notes,[note]);
  assert.match(f.messages[0],/已產生/);
  assert.deepEqual(f.busy,[true,false]);
});
test('oversized cloud export creates no download, reports failure and preserves all notes',async t=>{
  const notes=Array.from({length:100},(_,i)=>({...note,id:`n${i}`,text:'貓'.repeat(20000)}));
  const f=fixture(t,notes),before=JSON.stringify(f.state);
  await f.download();
  assert.equal(f.blobs.length,0);
  assert.match(f.messages[0],/5 MiB.*原資料仍保留/);
  assert.equal(JSON.stringify(f.state),before);
  assert.deepEqual(f.busy,[true,false]);
});
test('oversized selected file is rejected before reading or syncing',async t=>{
  const f=fixture(t),before=JSON.stringify(f.state);
  await f.select({size:MAX_BACKUP_BYTES+1,text:()=>{assert.fail('oversized file must not be read');}});
  assert.equal(f.syncs(),0);
  assert.equal(JSON.stringify(f.state),before);
  assert.equal(f.dom.button('#data-content','確認合併到雲端'),undefined);
  assert.ok(f.dom.find(f.dom.get('#data-content'),n=>n.attrs.role==='alert' && /5 MB/.test(n.textContent || n.children.join(''))));
});
for(const [name,raw] of [
  ['invalid JSON','{'],
  ['unsupported version',JSON.stringify({app:'cat-days',version:99})],
  ['invalid note',JSON.stringify({app:'cat-days',version:2,exportedAt:at,notes:[{...note,date:'2101-01-01'}],drafts:[],tombstones:[]})],
  ['UTF-8 bytes over limit','貓'.repeat(Math.floor(MAX_BACKUP_BYTES/3)+1)]
])test(`rejected cloud import ${name} performs no sync or data mutation`,async t=>{
  const f=fixture(t),before=JSON.stringify(f.state);
  // The parser independently validates actual bytes even if file metadata lies.
  await f.select({size:raw.length,text:async()=>raw});
  assert.equal(f.syncs(),0);
  assert.equal(JSON.stringify(f.state),before);
  assert.equal(f.dom.button('#data-content','確認合併到雲端'),undefined);
  assert.ok(f.dom.find(f.dom.get('#data-content'),n=>n.attrs.role==='alert'));
});
