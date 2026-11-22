/** Portable Windows MariaDB for NEW, local fictional fixtures only. Never reads application env/D1. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {access,lstat,mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {spawn} from 'node:child_process';
import net from 'node:net';
import mysql from 'mysql2/promise';
const CANONICAL='C:/Users/abinash/Desktop/HastaBazaar';
const VERSION='10.11.19';
const EXPECTED_SHA256='398ea30e5036010bbebe01d2b1804280424dcc2626e36d8e95155c04d25a0490';
const ARCHIVE=`mariadb-${VERSION}-winx64.zip`;
const BASE=`https://archive.mariadb.org/mariadb-${VERSION}/winx64-packages/`;
const PYTHON='C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const liveFixtures=new WeakSet();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assertUnder(root,target){const path=resolve(target),tail=relative(resolve(root),path);assert.ok(tail&&!tail.startsWith('..')&&!isAbsolute(tail),'Target must be strictly inside the owned fixture root.');return path;}
async function hashFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function projectRoot(){assert.equal(process.platform,'win32');const project=await realpath(CANONICAL);assert.equal((await realpath(process.cwd())).toLowerCase(),project.toLowerCase(),'Use the canonical checkout only.');assert.equal(resolve(dirname(fileURLToPath(import.meta.url)),'..').toLowerCase(),project.toLowerCase());return project;}
async function noLinks(root,path){let cursor=resolve(root);for(const part of relative(root,path).split(/[\\/]/).filter(Boolean)){cursor=join(cursor,part);const entry=await lstat(cursor);assert.equal(entry.isSymbolicLink(),false,'Fixture paths must not be links.');}}
async function ownedDirectory(parent,path){assertUnder(parent,path);await mkdir(path,{recursive:true});await noLinks(parent,path);return realpath(path);}
async function execute(file,args,options={}){return new Promise((resolvePromise,reject)=>{const child=spawn(file,args,{shell:false,windowsHide:true,cwd:options.cwd,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('close',code=>{const redact=value=>options.password?value.replaceAll(options.password,'[disposable password redacted]'):value;if(code!==0)reject(new Error(`${file.split(/[\\/]/).at(-1)} failed (${code}): ${redact(stderr||stdout).slice(-2500)}`));else resolvePromise({stdout:redact(stdout),stderr:redact(stderr)});});child.stdin.end(options.input??'');});}
async function freeLoopbackPort(){return new Promise((resolvePort,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolvePort(port));});});}
export async function preparePortableMariaFixture(){
 const project=await projectRoot(),parent=await ownedDirectory(project,resolve(project,'test-artifacts/mariadb'));
 const id='fixture-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+randomUUID().slice(0,8),root=assertUnder(parent,resolve(parent,id));
 await mkdir(root);await noLinks(parent,root);await writeFile(join(root,'.gitignore'),'*\n',{flag:'wx'});
 for(const name of ['runtime','data','tmp','logs'])await ownedDirectory(root,join(root,name));
 const sums=await fetch(BASE+'sha256sums.txt',{signal:AbortSignal.timeout(30000)});assert.equal(sums.status,200);assert.equal(new URL(sums.url).hostname,'archive.mariadb.org');const checksumText=await sums.text();
 const expected=checksumText.split(/\r?\n/).find(line=>line.endsWith('./'+ARCHIVE))?.split(/\s+/)[0];assert.equal(expected,EXPECTED_SHA256,'Official release checksum must match reviewed pinned metadata.');
 await writeFile(join(root,'official-sha256sums.txt'),checksumText,{flag:'wx'});
 console.log(JSON.stringify({stage:'download',fixture:id,version:VERSION,source:BASE+ARCHIVE}));
 const response=await fetch(BASE+ARCHIVE,{signal:AbortSignal.timeout(600000)});assert.equal(response.status,200);assert.equal(new URL(response.url).hostname,'archive.mariadb.org');let bytes=0,lastProgress=0;
 const progress=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes-lastProgress>=16*1024*1024){lastProgress=bytes;console.log(JSON.stringify({stage:'download-progress',fixture:id,bytes}));}callback(null,chunk);}});
 const archive=join(root,ARCHIVE);await pipeline(Readable.fromWeb(response.body),progress,createWriteStream(archive,{flags:'wx'}));assert.equal(await hashFile(archive),expected,'Do not extract or execute an unverified archive.');
 const extract=`import pathlib,sys,zipfile,stat\narchive=pathlib.Path(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve()\nwith zipfile.ZipFile(archive) as z:\n for item in z.infolist():\n  target=(root/item.filename).resolve()\n  if not target.is_relative_to(root) or pathlib.PurePosixPath(item.filename).is_absolute() or stat.S_ISLNK(item.external_attr>>16): raise RuntimeError('Unsafe ZIP entry')\n z.extractall(root)\nprint('Verified ZIP extracted inside owned runtime')\n`;
 await access(PYTHON);await execute(PYTHON,['-B','-c',extract,archive,join(root,'runtime')],{cwd:root});
 const basedir=assertUnder(root,join(root,'runtime',`mariadb-${VERSION}-winx64`));await noLinks(root,basedir);
 const server=assertUnder(root,join(basedir,'bin/mariadbd.exe'));await access(server);
 let initializer=join(basedir,'bin/mariadb-install-db.exe');try{await access(initializer);}catch{initializer=join(basedir,'bin/mysql_install_db.exe');await access(initializer);}
 const version=await execute(server,['--no-defaults','--version'],{cwd:root});assert.match(version.stdout,/10\.11\.19/);
 const password=randomBytes(32).toString('hex'),port=await freeLoopbackPort(),template=join(root,'bootstrap-template.ini');
 const normalized=value=>value.replaceAll('\\','/');
 await writeFile(template,`[mysqld]\nbasedir=${normalized(basedir)}\ntmpdir=${normalized(join(root,'tmp'))}\nbind-address=127.0.0.1\nskip-name-resolve\nevent-scheduler=OFF\nlocal-infile=0\n`,{flag:'wx'});
 assert.deepEqual(await readdir(join(root,'data')),[],'Initializer may only receive the fresh empty datadir.');
 const initialized=await execute(initializer,[`--datadir=${join(root,'data')}`,`--password=${password}`,`--port=${port}`,`--config=${template}`],{cwd:root,password});await writeFile(join(root,'logs/initialization.txt'),initialized.stdout+'\n'+initialized.stderr,{flag:'wx'});
 const state={kind:'hastabazaar-disposable-portable-mariadb-v1',id,root,version:VERSION,archive,archiveSha256:expected,basedir,server,serverSha256:await hashFile(server),data:join(root,'data'),tmp:join(root,'tmp'),logs:join(root,'logs'),password,createdAt:new Date().toISOString()};
 await writeFile(join(root,'private-state.json'),JSON.stringify(state,null,2),{flag:'wx'});
 await writeFile(join(root,'provenance.json'),JSON.stringify({kind:state.kind,id,version:VERSION,source:BASE+ARCHIVE,checksumSource:BASE+'sha256sums.txt',sha256:expected,serverVersion:version.stdout.trim(),initialized:true,serviceInstalled:false},null,2),{flag:'wx'});
 console.log(JSON.stringify({stage:'prepared',fixture:id,root,version:VERSION,sha256:expected}));return id;
}
async function readOwnedState(id){assert.match(id,/^fixture-\d{14}-[a-f0-9]{8}$/);const project=await projectRoot(),parent=resolve(project,'test-artifacts/mariadb'),root=assertUnder(parent,resolve(parent,id));await noLinks(project,root);const state=JSON.parse(await readFile(join(root,'private-state.json'),'utf8'));assert.equal(state.kind,'hastabazaar-disposable-portable-mariadb-v1');assert.equal(resolve(state.root).toLowerCase(),root.toLowerCase());assert.equal(state.id,id);assert.equal(state.version,VERSION);assert.equal(state.archiveSha256,EXPECTED_SHA256);for(const key of ['archive','basedir','server','data','tmp','logs']){assertUnder(root,state[key]);await noLinks(root,state[key]);}assert.equal(await hashFile(state.archive),EXPECTED_SHA256);assert.equal(await hashFile(state.server),state.serverSha256);assert.match(state.password,/^[a-f0-9]{64}$/);return state;}
async function isRunning(pid){try{process.kill(pid,0);return true;}catch{return false;}}
export async function withPortableMariaFixture(id,run){
 const state=await readOwnedState(id),port=await freeLoopbackPort(),pidFile=join(state.root,'server.pid'),errorLog=join(state.logs,'server-error.log'),stdoutLog=join(state.logs,'server-stdout.log'),stderrLog=join(state.logs,'server-stderr.log');
 try{const prior=JSON.parse(await readFile(join(state.root,'owned-process.json'),'utf8'));assert.equal(await isRunning(prior.pid),false,'Do not start a second server against this datadir.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const args=['--no-defaults',`--basedir=${state.basedir}`,`--datadir=${state.data}`,`--tmpdir=${state.tmp}`,`--pid-file=${pidFile}`,`--log-error=${errorLog}`,'--bind-address=127.0.0.1',`--port=${port}`,'--skip-name-resolve','--skip-log-bin','--event-scheduler=OFF','--local-infile=0',`--secure-file-priv=${state.tmp}`];
 assert.ok(args.every(arg=>!/[\s"'`]/.test(arg)),'Owned fixture paths/arguments must not need shell quoting.');
 const responseFile=join(state.root,'launch-response-'+randomUUID()+'.txt'),launchConfig=join(state.root,'launch.json');await writeFile(launchConfig,JSON.stringify({server:state.server,args,cwd:state.root,stdout:stdoutLog,stderr:stderrLog,response:responseFile}));
 const launch=`$ErrorActionPreference='Stop'\n$config=Get-Content -LiteralPath $args[0] -Raw | ConvertFrom-Json\n$p=Start-Process -FilePath $config.server -ArgumentList $config.args -WorkingDirectory $config.cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput $config.stdout -RedirectStandardError $config.stderr\nSet-Content -LiteralPath $config.response -Value $p.Id\n`;
 const launcher=join(state.root,'launch-owned-server.ps1');await writeFile(launcher,launch);
 // Windows PowerShell's redirected child streams can delay host exit until the
 // server exits. Capture its exact PID through an owned file, never host close.
 const host=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',launcher,launchConfig],{shell:false,windowsHide:true,cwd:state.root,stdio:'ignore'});host.unref();
 let pid;for(let attempt=0;attempt<100;attempt++){try{pid=Number((await readFile(responseFile,'utf8')).trim());break;}catch(error){if(error.code!=='ENOENT')throw error;await sleep(100);}}assert.ok(Number.isInteger(pid)&&pid>0,'Owned hidden launcher did not return its PID.');
 await writeFile(join(state.root,'owned-process.json'),JSON.stringify({pid,server:state.server,data:state.data,port,startedAt:new Date().toISOString()},null,2));
 let connection,requestedShutdown=false,result,operationError,operationFailed=false;
 try{
 let lastError;for(let attempt=0;attempt<100;attempt++){if(!await isRunning(pid))throw new Error('Owned MariaDB exited during startup; inspect only owned logs.');try{connection=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:state.password,connectTimeout:1000,multipleStatements:false});break;}catch(error){lastError=error;await sleep(200);}}
 if(!connection)throw new Error('Owned loopback fixture did not become ready: '+String(lastError).replaceAll(state.password,'[redacted]'));
 const [rows]=await connection.query("SELECT VERSION() version,@@datadir dataDirectory,@@port port,@@bind_address bindAddress,@@skip_name_resolve skipNameResolve,@@log_bin logBin,@@event_scheduler eventScheduler,@@local_infile localInfile,@@pid_file pidFile");const facts=rows[0];assert.match(facts.version,/^10\.11\.19/);assert.equal(resolve(facts.dataDirectory).toLowerCase(),resolve(state.data).toLowerCase());assert.equal(Number(facts.port),port);assert.equal(facts.bindAddress,'127.0.0.1');assert.equal(Number(facts.skipNameResolve),1);assert.equal(Number(facts.logBin),0);assert.equal(facts.eventScheduler,'OFF');assert.equal(Number(facts.localInfile),0);assert.equal(resolve(facts.pidFile).toLowerCase(),resolve(pidFile).toLowerCase());assert.equal(Number((await readFile(pidFile,'utf8')).trim()),pid);
 const fixture={id,root:state.root,connection,port,pid,facts};liveFixtures.add(fixture);try{result=await run(fixture);}finally{liveFixtures.delete(fixture);}
 }catch(error){operationError=error;operationFailed=true;}
 // Always finish owned cleanup, then retain both failures if the operation and
 // shutdown fail. A cleanup failure must neither hide the original failure nor
 // turn forced termination into a successful fixture run.
 let cleanupError,cleanupFailed=false;
 try{
 let shutdownError;
 if(connection){try{await connection.query('SHUTDOWN');requestedShutdown=true;}catch(error){if(['PROTOCOL_CONNECTION_LOST','ECONNRESET'].includes(error.code))requestedShutdown=true;else shutdownError=error;}finally{await connection.end().catch(()=>{});}}
 for(let attempt=0;attempt<100&&await isRunning(pid);attempt++)await sleep(100);
 let stopped=!await isRunning(pid),forcedStop=false;
 if(!stopped){const cleanup=join(state.root,'stop-exact-owned-server.ps1');await writeFile(cleanup,`$ErrorActionPreference='Stop'\n$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue\nif($p){if([IO.Path]::GetFullPath($p.Path) -ne [IO.Path]::GetFullPath('${state.server.replaceAll("'","''")}')){throw 'Owned PID identity changed; refusing stop'};Stop-Process -Id ${pid} -Force}\n`);await execute('powershell.exe',['-NoProfile','-NonInteractive','-File',cleanup],{cwd:state.root});forcedStop=true;for(let attempt=0;attempt<50&&await isRunning(pid);attempt++)await sleep(100);stopped=!await isRunning(pid);}
 await writeFile(join(state.root,'last-shutdown.json'),JSON.stringify({pid,authenticatedShutdown:requestedShutdown,forcedStop,stopped,at:new Date().toISOString()},null,2));assert.ok(stopped,'Owned server is still running; retain its exact PID and inspect owned logs.');assert.equal(forcedStop,false,'Fixture required forced cleanup; authenticated shutdown did not complete.');if(shutdownError)throw shutdownError;
 }catch(error){cleanupError=error;cleanupFailed=true;}
 if(operationFailed&&cleanupFailed)throw new AggregateError([operationError,cleanupError],'Fixture operation and owned cleanup both failed.',{cause:operationError});
 if(operationFailed)throw operationError;
 if(cleanupFailed)throw cleanupError;
 return result;
}
export function splitFixtureSql(sql){let delimiter=';',buffer='';const statements=[];const commentsOnly=text=>!text.trim()||text.trim().split('\n').every(line=>!line.trim()||line.trim().startsWith('--'));for(const line of sql.split(/\r?\n/)){const directive=/^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);if(directive){assert.ok(commentsOnly(buffer));delimiter=directive[1];buffer='';continue;}buffer+=line+'\n';if(buffer.trimEnd().endsWith(delimiter)){const statement=buffer.trimEnd().slice(0,-delimiter.length);if(!commentsOnly(statement))statements.push(statement);buffer='';}}assert.ok(commentsOnly(buffer),'SQL must have an explicit final delimiter.');return statements;}
export async function createFixtureDatabase(fixture,label,collation='utf8mb4_unicode_ci'){assert.ok(liveFixtures.has(fixture));assert.match(label,/^[a-z][a-z0-9_]{0,24}$/);assert.ok(['utf8mb4_unicode_ci','utf8mb4_general_ci'].includes(collation));const name='fixture_'+fixture.id.split('-').at(-1)+'_'+label;const[existing]=await fixture.connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[name]);assert.equal(existing.length,0,'Never reuse an existing database.');await fixture.connection.query('CREATE DATABASE `'+name+'` CHARACTER SET utf8mb4 COLLATE '+collation);await fixture.connection.query('USE `'+name+'`');fixture.database=name;return name;}
/** Root must explicitly authorize schema import before calling; never invoked by prepare/probe. */
export async function importFixtureSql(fixture,path){
 assert.ok(liveFixtures.has(fixture),'Use only this helper\'s currently verified owned connection.');assert.match(fixture.database??'',/^fixture_[a-f0-9]{8}_[a-z][a-z0-9_]{0,24}$/,'Select a newly created owned test database first.');const project=await projectRoot(),target=resolve(path);assert.ok(target.startsWith(resolve(project,'deployment/babal')+'\\')||target.startsWith(resolve(fixture.root)+'\\'),'Import only reviewed Maria source or owned fixture SQL.');await noLinks(project,target);const sql=await readFile(target,'utf8'),normalized=sql.replaceAll('\r\n','\n'),statements=splitFixtureSql(normalized);let cursor=0;
 for(const[index,statement]of statements.entries()){
  assert.doesNotMatch(statement.replace(/^\s*--[^\n]*(\n|$)/gm,''),/^\s*(USE\b|CREATE\s+DATABASE\b|DROP\s+DATABASE\b)/i,'Schema import must not switch or create an unowned database.');const offset=normalized.indexOf(statement,cursor);assert.ok(offset>=0);cursor=offset+statement.length;
  try{await fixture.connection.query(statement);}catch(error){let foreignKeyDiagnostic;if(error.code?.includes('FK')||error.errno===150){const[engine]=await fixture.connection.query('SHOW ENGINE INNODB STATUS');const text=String(engine[0]?.Status??''),start=text.indexOf('LATEST FOREIGN KEY ERROR'),end=text.indexOf('TRANSACTIONS',start+1);foreignKeyDiagnostic=start<0?'No latest foreign-key error in owned engine status':text.slice(start,end>start?end:start+2500).slice(0,2500);}const diagnostic={path:target,database:fixture.database,statementIndex:index+1,normalizedSourceOffset:offset,sourceLine:normalized.slice(0,offset).split('\n').length,code:error.code,errno:error.errno,sqlState:error.sqlState,message:String(error.message).slice(0,2000),foreignKeyDiagnostic,exactSqlPreview:statement.slice(0,2500),sqlTruncated:statement.length>2500};const failure=new Error('Owned fixture import failed: '+JSON.stringify(diagnostic));failure.diagnostic=diagnostic;throw failure;}
 }
 return {path:target,statements:statements.length,sha256:createHash('sha256').update(sql).digest('hex')};
}
export async function probePortableMariaFixture(id){return withPortableMariaFixture(id,async fixture=>{const [schemas]=await fixture.connection.query('SELECT SCHEMA_NAME name FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME');assert.ok(schemas.every(row=>['information_schema','mysql','performance_schema','sys','test'].includes(row.name)),'Connectivity probe must not encounter an application database.');const result={fixture:id,pid:fixture.pid,port:fixture.port,version:fixture.facts.version,dataDirectory:fixture.facts.dataDirectory,schemas:schemas.map(row=>row.name),emptyApplicationFixture:true};await writeFile(join(fixture.root,'connectivity-evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;});}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const[action,id]=process.argv.slice(2);if(action==='prepare'&&!id)await preparePortableMariaFixture();else if(action==='probe'&&id)await probePortableMariaFixture(id);else throw new Error('Use prepare, or probe <owned-fixture-id>. Schema import is intentionally not a CLI action.');}
