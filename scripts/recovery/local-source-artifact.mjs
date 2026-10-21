import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdtemp,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileDigest} from './native-recovery.mjs';
import {canonicalJson} from '../../lib/portability/values.ts';

const directories=['app','components','lib','db','hooks','public','scripts','tests','drizzle','deployment','vendor','docs'];
const rootFiles=['package.json','package-lock.json','tsconfig.json','vite.config.ts','next.config.ts','drizzle.config.ts','middleware.ts','postcss.config.mjs','components.json','.oxlintrc.json','.oxfmtrc.json','.editorconfig','.gitattributes','.gitignore','START-HASTABAZAAR.cmd','AGENTS.md','LOCAL-START.md','README.md','.openai/hosting.json','.github/workflows/verify-release.yml'];
export function assertLocalRecoveryMode(environment=process.env){
 assert.ok(!environment.CI&&!environment.GITHUB_ACTIONS,'Local source-snapshot recovery is forbidden in CI');
}
/** A real content fingerprint of dirty/untracked source, never a claim about a Git commit or Linux binary. */
export async function createLocalSourceArtifact(project,workspace){
 assertLocalRecoveryMode();
 async function scan(){
  const files=[];
  async function file(relative,optional=false){
   let info;try{info=await lstat(resolve(project,relative));}catch(error){if(optional&&error.code==='ENOENT')return;throw error;}
   assert.ok(!info.isSymbolicLink(),'Source snapshots cannot follow links');
   if(info.isDirectory()){
    for(const name of (await readdir(resolve(project,relative))).sort()){
     assert.ok(name&&!/[\r\n\\]/.test(name));
     if(name==='node_modules'||name==='.git'||name==='.staging'||name.startsWith('.env')||name.startsWith('.dev.vars'))throw Error('Private/dependency directory in source snapshot');
     await file(relative+'/'+name);
    }
   }else{
    assert.ok(info.isFile()&&!/\.(?:pem|key|pfx|p12|sqlite|sqlite3|db|log|zip|gz)$/i.test(relative),'Private/generated file in source snapshot');
    files.push({path:relative,bytes:info.size,sha256:await fileDigest(resolve(project,relative))});
   }
  }
  for(const directory of directories)await file(directory,true);
  for(const name of rootFiles)await file(name,true);
  return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 }
 const files=await scan();assert.ok(files.some(file=>file.path==='package-lock.json')&&files.some(file=>file.path==='app/auth.ts'));
 const sourceSha256=createHash('sha256').update(canonicalJson(files)).digest('hex');
 const release='hastabazaar-release-local-source-'+sourceSha256.slice(0,20),directory=await mkdtemp(resolve(workspace,release+'-'));
 const list=resolve(directory,'source-files.txt');await writeFile(list,files.map(file=>file.path).join('\n')+'\n',{flag:'wx',mode:0o600});
 const archive=release+'.tar.gz';execFileSync('tar',['-czf',resolve(directory,archive),'-C',project,'-T',list],{stdio:'pipe'});
 assert.deepEqual(await scan(),files,'Source changed while packaging the local recovery fixture');
 const inventory={schemaVersion:1,release,artifactKind:'source-snapshot',commit:null,sourceSha256,linuxRuntimeVerified:false,archive,archiveSha256:await fileDigest(resolve(directory,archive)),files};
 await writeFile(resolve(directory,'inventory.json'),JSON.stringify(inventory,null,2)+'\n',{flag:'wx',mode:0o600});return directory;
}
