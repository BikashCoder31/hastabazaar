import mysql from 'mysql2/promise';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='outputs/section-two-2026-09-12/restore-drill';await mkdir(out,{recursive:true});
const root=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root',multipleStatements:true});
const [schemas]=await root.query("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'section_security_%' ORDER BY SCHEMA_NAME DESC");
const source=schemas[0]?.name;assert.match(source,/^section_security_\d+$/);const restored='restore_drill_'+Date.now();await root.query(`CREATE DATABASE ${restored}`);
const dumpPath=process.cwd()+'/'+out+'/synthetic-database.sql';
const exit=await new Promise((resolve,reject)=>{const child=spawn('outputs/wallet-test-runtime/mariadb-11.4.9-winx64/bin/mariadb-dump.exe',['--no-defaults','--host=127.0.0.1','--port=13316','--user=root','--single-transaction','--skip-lock-tables','--routines','--triggers','--hex-blob','--result-file='+dumpPath,source],{windowsHide:true,stdio:['ignore','ignore','pipe']});child.on('error',reject);child.on('exit',resolve);});assert.equal(exit,0);
await root.query(`USE ${restored}`);const sql=await readFile(dumpPath,'utf8');let delimiter=';',buffer='';
for(const line of sql.split('\n')){if(/^DELIMITER\s+/i.test(line.trim())){delimiter=line.trim().split(/\s+/)[1];continue;}if(line.startsWith('--')||!line.trim())continue;buffer+=line+'\n';if(buffer.trimEnd().endsWith(delimiter)){const statement=buffer.trimEnd().slice(0,-delimiter.length);buffer='';if(statement.trim())await root.query(statement);}}
if(buffer.trim())await root.query(buffer);
const [tables]=await root.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=?',[source,'BASE TABLE']);
const digest=rows=>createHash('sha256').update(rows.map(row=>JSON.stringify(row,(_key,value)=>Buffer.isBuffer(value)?value.toString('hex'):value)).sort().join('\n')).digest('hex');
for(const {name} of tables){assert.match(name,/^[a-z_]+$/);const [before]=await root.query(`SELECT * FROM ${source}.${name}`),[after]=await root.query(`SELECT * FROM ${restored}.${name}`);assert.equal(after.length,before.length,name);assert.equal(digest(after),digest(before),name);}
const [[triggerCounts]]=await root.query('SELECT (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?) AS original,(SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?) AS restored',[source,restored]);assert.equal(triggerCounts.original,triggerCounts.restored);
const [beforeTriggers]=await root.query('SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[source]);const [afterTriggers]=await root.query('SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[restored]);assert.equal(digest(afterTriggers),digest(beforeTriggers));
const media='outputs/section-two-2026-09-12/private-media';let mediaFiles=0;
async function copyTree(relative=''){for(const entry of await readdir(media+'/'+relative,{withFileTypes:true})){const rel=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory()){await mkdir(out+'/media/'+rel,{recursive:true});await copyTree(rel);}else if(entry.isFile()){await mkdir(out+'/media/'+relative,{recursive:true});await copyFile(media+'/'+rel,out+'/media/'+rel);assert.equal(createHash('sha256').update(await readFile(media+'/'+rel)).digest('hex'),createHash('sha256').update(await readFile(out+'/media/'+rel)).digest('hex'));mediaFiles++;}}}
await copyTree();assert.ok(mediaFiles>0);
const result={localSyntheticOnly:true,tablesCompared:tables.length,triggersRestored:Number(triggerCounts.restored),mediaFilesCompared:mediaFiles,dumpSha256:createHash('sha256').update(sql).digest('hex'),result:'All restored rows, trigger counts and media byte hashes match; source untouched.'};await writeFile(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await root.end();
