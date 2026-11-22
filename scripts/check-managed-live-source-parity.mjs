/** Execute source generators with captured writes; never alter retained SQLite/parity files. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const project=await realpath(fileURLToPath(new URL('..',import.meta.url))),targets=[
 ['scripts/generate-managed-live-activation-source.ts','drizzle/0145_managed_live_activation.sql','deployment/babal/mariadb-managed-live-activation.sql'],
 ['scripts/generate-managed-live-financial-source.ts','drizzle/0146_managed_live_financial.sql','deployment/babal/mariadb-managed-live-financial.sql'],
];
assert.equal((await realpath(process.cwd())).toLowerCase(),project.toLowerCase());
const generatorUrls=new Set(targets.map(([generator])=>pathToFileURL(resolve(project,generator)).href.toLowerCase())),captured=new Map();
globalThis.__managedSourceWrite=async(path,data)=>{const target=resolve(project,path instanceof URL?fileURLToPath(path):String(path));assert.ok(target.startsWith(project+sep),'Generator output must be inside the project.');assert.ok(!captured.has(target),'Generator output must be unique.');captured.set(target,Buffer.from(data));};
registerHooks({resolve(specifier,context,next){if(specifier==='node:fs/promises'&&generatorUrls.has(context.parentURL?.split('?')[0].toLowerCase()))return {url:'data:text/javascript,export {readFile} from "node:fs/promises";export const writeFile=(...args)=>globalThis.__managedSourceWrite(...args);',shortCircuit:true};return next(specifier,context);}});
const results=[];
for(const[generator,...outputs]of targets){await import(pathToFileURL(resolve(project,generator)).href+'?parity='+randomUUID());for(const output of outputs){const path=resolve(project,output),actual=await readFile(path),generated=captured.get(path);assert.ok(generated,'Captured '+output);assert.deepEqual(generated,actual,'Retained source must match generator without rewriting: '+output);results.push({path:output,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});}}
assert.equal(captured.size,4);delete globalThis.__managedSourceWrite;
const directory=resolve(project,'.test-artifacts/t28');await mkdir(directory,{recursive:true});const evidencePath=join(directory,'managed-live-parity-'+randomUUID()+'.json');await writeFile(evidencePath,JSON.stringify({status:'PASS',capturedWritesOnly:true,results},null,2),{flag:'wx'});console.log(JSON.stringify({status:'PASS',capturedWritesOnly:true,results,evidencePath}));
