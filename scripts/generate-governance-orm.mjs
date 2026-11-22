import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

// Introspection uses only an owned memory database. Existing application data is never opened.
const database=new DatabaseSync(':memory:');
const camel=value=>value.replace(/_([a-z])/g,(_all,letter)=>letter.toUpperCase());
const quote=value=>JSON.stringify(value);
const begin='// BEGIN T30 GOVERNANCE ORM';
const end='// END T30 GOVERNANCE ORM';
try {
  database.exec('CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE staff_invitations(id TEXT PRIMARY KEY); CREATE TABLE operational_incidents(id TEXT PRIMARY KEY); CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY);');
  database.exec(await readFile(new URL('../drizzle/0148_email_service_health.sql',import.meta.url),'utf8'));
  const sources=await Promise.all(['0149_team_governance.sql','0150_incident_governance.sql','0151_form_health_records.sql'].map(name=>readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')));
  for(const source of sources)database.exec(source);
  const names=sources.flatMap(source=>[...source.matchAll(/CREATE TABLE (\w+)/g)].map(match=>match[1]));
  const blocks=[];
  for(const name of names){
    const columns=database.prepare(`PRAGMA table_info('${name}')`).all();
    const primary=columns.filter(column=>column.pk).sort((a,b)=>a.pk-b.pk);
    const foreign=database.prepare(`PRAGMA foreign_key_list('${name}')`).all();
    const fields=columns.map(column=>{
      if(!['TEXT','INTEGER'].includes(column.type))throw new Error('Unsupported governance ORM type '+column.type);
      let definition=(column.type==='TEXT'?'text':'integer')+'('+quote(column.name)+')';
      if(primary.length===1&&column.pk)definition+='.primaryKey()';
      if(column.notnull||column.pk)definition+='.notNull()';
      if(column.dflt_value!==null){
        const value=column.dflt_value;
        definition+=/^-?\d+$/.test(value)?'.default('+value+')':/^'[^']*'$/.test(value)?'.default('+quote(value.slice(1,-1))+')':'.default(sql.raw('+quote(value)+'))';
      }
      const reference=foreign.find(key=>key.from===column.name);
      if(reference){
        if(foreign.filter(key=>key.id===reference.id).length!==1)throw new Error('Explicit composite foreign-key mapping required.');
        definition+='.references(()=>'+camel(reference.table)+'.'+camel(reference.to)+')';
      }
      return ' '+camel(column.name)+':'+definition+',';
    });
    const constraints=[];
    if(primary.length>1)constraints.push('primaryKey({columns:['+primary.map(column=>'t.'+camel(column.name)).join(',')+']})');
    for(const index of database.prepare(`PRAGMA index_list('${name}')`).all()){
      if(index.origin==='pk')continue;
      if(index.partial)throw new Error('Explicit partial-index mapping required.');
      const nativeIndexName=String(index.name);
      const indexName=nativeIndexName.startsWith('sqlite_autoindex_')?name+'_unique_'+index.seq:nativeIndexName;
      const keys=database.prepare(`PRAGMA index_info('${nativeIndexName}')`).all();
      if(keys.some(key=>key.name===null))throw new Error('Explicit expression-index mapping required.');
      constraints.push((index.unique?'uniqueIndex':'index')+'('+quote(indexName)+').on('+keys.map(key=>'t.'+camel(key.name)).join(',')+')');
    }
    const create=database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name).sql;
    let checkNumber=0;
    for(const match of create.matchAll(/\bCHECK\s*\(/gi)){
      const start=match.index+match[0].length;
      let depth=1,quoted=false,position=start;
      for(;position<create.length&&depth>0;position++){
        const char=create[position];
        if(char==="'"){if(quoted&&create[position+1]==="'"){position++;continue;}quoted=!quoted;}
        if(!quoted){if(char==='(')depth++;if(char===')')depth--;}
      }
      if(depth!==0)throw new Error('Unclosed CHECK expression.');
      constraints.push('check('+quote(name+'_check_'+checkNumber++)+',sql.raw('+quote(create.slice(start,position-1))+'))');
    }
    blocks.push('export const '+camel(name)+'=sqliteTable('+quote(name)+',{\n'+fields.join('\n')+'\n}'+(constraints.length?','+(constraints.some(value=>/^(primaryKey|index|uniqueIndex)\(/.test(value))?'t':'_t')+'=>[\n '+constraints.join(',\n ')+'\n]':'')+');');
  }
  const path=new URL('../db/schema.ts',import.meta.url);
  const raw=await readFile(path,'utf8'),newline=raw.includes('\r\n')?'\r\n':'\n';
  let text=raw.replace(/\r\n/g,'\n');
  const start=text.indexOf(begin),stop=text.indexOf(end);
  if((start<0)!==(stop<0)||stop>=0&&stop<start)throw new Error('Incomplete ORM ownership markers.');
  const untouched=start<0?text:text.slice(0,start)+text.slice(stop+end.length);
  for(const name of names)if(new RegExp('export const '+camel(name)+'\\s*=').test(untouched))throw new Error('Existing ORM export outside owned section: '+name);
  const section=begin+'\n'+blocks.join('\n')+'\n'+end;
  text=start<0?text.trimEnd()+'\n\n'+section+'\n':text.slice(0,start)+section+text.slice(stop+end.length);
  await writeFile(path,text.replace(/\n/g,newline));
  console.log('Mapped '+names.length+' additive tables from isolated schema introspection.');
} finally {database.close();}
