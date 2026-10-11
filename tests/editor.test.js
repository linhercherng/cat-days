import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditor} from '../src/editor.js';
import {createCloudStore} from '../src/cloud-store.js';
import {installDOM} from './helpers/dom.js';

const at='2026-10-11T00:00:00.000Z';
const original={id:'a',date:'2026-10-11',text:'原稿',mood:'',moodText:'',createdAt:at,updatedAt:at,version:1,changeSeq:1,deletedAt:null};
const deleted={...original,version:3,changeSeq:3,date:null,text:null,mood:null,moodText:null,deletedAt:at};
async function fixture(t, {latest, action='save', accept=true, failure}={}) {
  const dom=installDOM(t),disk=new Map(),routes=[],messages=[],requests=[];
  let current=original, syncing=false;
  const conflict={...original,date:'2026-10-12',text:'衝突時版本',version:2,changeSeq:2};
  const store=createCloudStore({owner:'test-owner',storage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)},
    rpc:async(name,args)=>{
      if(name==='cat_days_changes') {
        if(syncing && failure==='sync')throw Error('sync failed');
        return {records:current.changeSeq>args.p_after?[current]:[],cursor:current.changeSeq,hasMore:false};
      }
      requests.push(args);
      return {status:'conflict',record:conflict};
    }});
  await store.sync();
  const editor=createEditor(store,{ask:async()=>accept,status:m=>messages.push(m),go:r=>routes.push(r),today:()=>original.date});
  editor.open(new URLSearchParams('id=a'),store.read(),'#home');
  dom.get('#note-date').value='2026-10-20';
  dom.get('#note-text').value='本機草稿';
  await dom.get('#note-form').emit('input');await editor.flush();
  // Delete confirmation is also accepted when testing the delete-conflict path.
  if(action==='delete')await dom.get('#delete-note').click();
  else await dom.get('#note-form').emit('submit');
  assert.equal(dom.get('#conflict-choice').hidden,false);
  assert.equal(store.read().drafts.length,1);
  current=latest || {...conflict,date:'2026-10-15',text:'接受前又修改',version:3,changeSeq:3};syncing=true;
  if(failure==='discard')store.discardDraft=async()=>{throw Error('discard failed');};
  return {dom,store,editor,routes,messages,requests,
    accept:()=>dom.button('#conflict-choice','使用雲端版本').click()};
}

for(const action of ['save','delete']) {
  for(const [name,latest,date] of [
    ['moved again since conflict',null,'2026-10-15'],
    ['unchanged date',{...original,text:'雲端修改',version:3,changeSeq:3},original.date],
    ['deleted',deleted,original.date]
  ]) test(`accept cloud after ${action} conflict: ${name}`,async t=>{
    const f=await fixture(t,{latest,action});
    await f.accept();
    assert.deepEqual(f.routes,[`#day?date=${date}`]);
    assert.equal(f.store.read().drafts.length,0);
    assert.equal(f.dom.get('#conflict-choice').hidden,true);
    assert.equal(f.requests.length,1); // Acceptance performs no server write.
    assert.equal(f.editor.isBusy(),false);
    if(latest===deleted)assert.equal(f.store.read().notes.length,0);
    else assert.equal(f.store.read().notes[0].date,date);
  });
}

for(const failure of ['sync','discard'])test(`cloud acceptance ${failure} failure retains draft and editor`,async t=>{
  const f=await fixture(t,{failure});
  await f.accept();
  assert.deepEqual(f.routes,[]);
  assert.deepEqual(f.messages,[]);
  assert.equal(f.store.read().drafts[0].text,'本機草稿');
  assert.equal(f.dom.get('#conflict-choice').hidden,false);
  assert.match(f.dom.get('#editor-error').textContent,/failed/);
  assert.equal(f.editor.isBusy(),false);
});

test('cancel cloud acceptance leaves input and draft unchanged',async t=>{
  const f=await fixture(t,{accept:false}),before=f.store.raw();
  await f.accept();
  assert.equal(f.store.raw(),before);
  assert.deepEqual(f.routes,[]);
  assert.equal(f.dom.get('#note-date').value,'2026-10-20');
  assert.equal(f.dom.get('#conflict-choice').hidden,false);
});

test('reopened new-note draft with a confirmed cloud ID navigates to that note after conflict',async t=>{
  const dom=installDOM(t),disk=new Map(),routes=[];
  let latest=original;
  const store=createCloudStore({owner:'test-owner',storage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)},rpc:async(name,args)=>name==='cat_days_changes'
    ? {records:latest.changeSeq>args.p_after?[latest]:[],cursor:latest.changeSeq,hasMore:false}
    : {status:'conflict',record:{...original,version:2,changeSeq:2}}});
  await store.sync();
  await store.saveDraft({id:'new',slot:'new',noteId:null,date:'2026-10-20',text:'重新開啟草稿',mood:'',moodText:''});
  const local=JSON.parse(store.raw());local.drafts[0].savedId='a';local.drafts[0].baseVersion=1;
  disk.set(store.key,JSON.stringify(local));
  const editor=createEditor(store,{ask:async()=>true,status:()=>{},go:r=>routes.push(r),today:()=>original.date});
  editor.open(new URLSearchParams(),store.read(),'#home');
  await dom.button('#draft-choice','繼續草稿').click();
  await dom.get('#note-form').emit('submit');
  latest={...original,date:'2026-10-15',version:3,changeSeq:3};
  await dom.button('#conflict-choice','使用雲端版本').click();
  assert.deepEqual(routes,['#day?date=2026-10-15']);
  assert.equal(store.read().drafts.length,0);
});
