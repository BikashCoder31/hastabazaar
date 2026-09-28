import { stubFixtureLink } from './helpers/browser-fixture-link';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createElement,type ComponentType} from 'react';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
async function component(file:string,name:string){
 const source=await readFile(file,'utf8');
 const compiled=await build({stdin:{contents:source+'\nexport { '+name+' as Tested };',resolveDir:dirname(resolve(file)),sourcefile:resolve(file),loader:'tsx'},jsx:'automatic',bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'test-navigation',setup(b){stubFixtureLink(b);b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'exports.useRouter=()=>({refresh(){}});',loader:'js'}));}}]});
 const result={exports:{} as {Tested:ComponentType<Record<string,unknown>>}};runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:result,exports:result.exports,process,crypto});return result.exports.Tested;
}
void test('governance shared field renders a visible marker only for required controls',async()=>{
 const Field=await component('components/admin/governance-console.tsx','Field');
 for(const tag of ['input','textarea','select'])for(const required of [true,false]){
  const html=renderToStaticMarkup(createElement(Field,{label:'Evidence reference'},createElement(tag,{required})));const text=html.replace(/<[^>]*>/g,'');
  if(required)assert.match(text,/\*/);else assert.doesNotMatch(text,/\*/);
 }
});
void test('scheduled carrier pickup visibly labels its required confirmation note',async()=>{
 const Record=await component('components/seller/shipping-workspace.tsx','ShippingRecord');
 const html=renderToStaticMarkup(createElement(Record,{job:{id:'synthetic',orderNumber:'SYNTHETIC',status:'pickup_scheduled',direction:'outbound'}}));
 const label=(html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g)??[]).find(v=>v.includes('for="pickup-synthetic"'));assert.ok(label);assert.match(label.replace(/<[^>]*>/g,''),/\*/);
});
