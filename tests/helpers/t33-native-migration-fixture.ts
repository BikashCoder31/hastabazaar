import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
/** Real source migrations with historical rows present. No file DB, clone, suspended trigger or target argument. */
export async function t33NativeMigrationFixture(before:(name:string,db:D1Database)=>Promise<void>){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated T33 fixture")}}',d1Databases:{DB:randomUUID()},d1Persist:false}));
 try{const db=await mf.getD1Database('DB')as unknown as D1Database;const names=(await readdir(new URL('../../drizzle/',import.meta.url))).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
  for(const name of names){await before(name,db);const sql=await readFile(new URL('../../drizzle/'+name,import.meta.url),'utf8'),statements=sql.split('--> statement-breakpoint').map(part=>part.trim()).filter(part=>part.split(/\r?\n/).some(line=>line.trim()&&!line.trim().startsWith('--')));let pending:string[]=[];
   const flush=async()=>{if(!pending.length)return;const chunk=pending;pending=[];try{await db.batch(chunk.map(statement=>db.prepare(statement)));}catch(error){throw new Error('T33 actual migration failed: '+name,{cause:error});}};
   for(const statement of statements){if(/^\s*(?:--[^\n]*\n\s*)*PRAGMA\b/i.test(statement)){await flush();await db.prepare(statement).run();}else{pending.push(statement);if(pending.length===100)await flush();}}await flush();
  }return{db,names,dispose:()=>mf.dispose()};
 }catch(error){await mf.dispose();throw error;}
}
