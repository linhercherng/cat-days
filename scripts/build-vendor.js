import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
await mkdir('assets/vendor',{recursive:true});
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:'assets/vendor/supabase.js',legalComments:'external'});
const pkg=JSON.parse(await readFile('node_modules/@supabase/supabase-js/package.json','utf8'));
await writeFile('assets/vendor/README.md',`# Supabase browser SDK\n\nVersion ${pkg.version}; bundled locally with pinned package-lock.json using npm run build:vendor. Loaded only when cloud is configured. See supabase.js.LEGAL.txt and package licenses for attribution. No external script CDN required.\n`);
