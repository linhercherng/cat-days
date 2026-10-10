import test from 'node:test';
import assert from 'node:assert/strict';
import {authStorage} from '../src/auth-storage.js';
import {validCloudConfig} from '../src/cloud-auth.js';
test('tokens never persist; PKCE verifier survives redirect only until expiry',()=>{
 const disk=new Map(); const session={getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)};
 let time=0; const a=authStorage(session,()=>time);
 a.setItem('cat-days-auth','secret-session'); a.setItem('cat-days-auth-code-verifier','one-use');
 assert.equal(disk.size,1); const b=authStorage(session,()=>time);
 assert.equal(b.getItem('cat-days-auth'),null); assert.equal(b.getItem('cat-days-auth-code-verifier'),'one-use');
 time=600001; assert.equal(b.getItem('cat-days-auth-code-verifier'),null); assert.equal(disk.size,0);
});
test('only HTTPS Supabase project and public publishable key enable cloud',()=>{
 assert.equal(validCloudConfig({url:'https://project.supabase.co',publishableKey:'sb_publishable_example'}),true);
 for (const config of [{},{url:'http://project.supabase.co',publishableKey:'sb_publishable_example'},{url:'https://evil.example',publishableKey:'sb_publishable_example'},{url:'https://project.supabase.co',publishableKey:'sb_secret_no'}]) assert.equal(validCloudConfig(config),false);
});
