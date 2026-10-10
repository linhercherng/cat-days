import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('assets/vendor',{recursive:true});
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:'assets/vendor/supabase.js',legalComments:'external'});
const pkg=JSON.parse(await readFile('node_modules/@supabase/supabase-js/package.json','utf8'));
const packages=['@supabase/supabase-js','@supabase/auth-js','@supabase/postgrest-js','@supabase/storage-js','@supabase/functions-js','@supabase/realtime-js','iceberg-js'];
const licenses=await Promise.all(packages.map(async name=>`${name}\n${await readFile(`node_modules/${name}/LICENSE`,'utf8')}`));
await writeFile('assets/vendor/LICENSES.txt',licenses.join('\n\n'));
await writeFile('assets/vendor/README.md',`# Supabase browser SDK\n\nVersion ${pkg.version}; bundled locally with pinned package-lock.json using npm run build:vendor. Loaded only when cloud is configured. See LICENSES.txt for attribution. No external script CDN required.\n`);
