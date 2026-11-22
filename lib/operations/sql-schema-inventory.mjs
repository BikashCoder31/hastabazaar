// Structural source inventory only. This does not execute SQL or infer runtime state.
// Token positions retain exact reviewed DDL while strings/comments cannot become SQL.
export function schemaTokens(sql) {
 const out=[];
 for(let i=0;i<sql.length;){
  if(/\s/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)||sql[i]==='#'){const end=sql.indexOf('\n',i);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);if(end<0)throw new Error('Unterminated SQL comment');i=end+2;continue;}
  const start=i,quote=sql[i];
  if(['\'', '"', '`'].includes(quote)){
   i++;let value='',closed=false;
   while(i<sql.length){if(sql[i]==='\\'){value+=sql.slice(i,i+2);i+=2;continue;}
    if(sql[i]===quote){if(sql[i+1]===quote){value+=quote;i+=2;continue;}i++;closed=true;break;}value+=sql[i++];}
   if(!closed)throw new Error('Unterminated SQL quote');
   out.push({value,kind:quote==='`'?'word':'literal',quoted:quote==='`',start,end:i});continue;
  }
  const word=/^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(i));
  if(word){i+=word[0].length;out.push({value:word[0],kind:'word',start,end:i});}
  else {out.push({value:sql[i++],kind:'symbol',start,end:i});}
 }
 return out;
}
export function extractCreateTables(sql) {
 const tokens=schemaTokens(sql),tables=[];
 const is=(i,value)=>tokens[i]?.kind==='word'&&tokens[i].value.toUpperCase()===value;
 for(let i=0;i<tokens.length;i++){
  if(!is(i,'CREATE')||!is(i+1,'TABLE'))continue;
  const start=tokens[i].start;let at=i+2;
  if(is(at,'IF')&&is(at+1,'NOT')&&is(at+2,'EXISTS'))at+=3;
  const name=tokens[at++];
  if(name?.kind!=='word'||tokens[at]?.value!=='(')throw new Error('Unsupported CREATE TABLE inventory shape');
  const open=at++;let depth=1,part=at;const definitions=[];
  for(;at<tokens.length;at++){
   if(tokens[at].kind!=='symbol')continue;
   if(tokens[at].value==='(')depth++;
   if(tokens[at].value===')')depth--;
   if(depth===0||(depth===1&&tokens[at].value===',')){
    if(at>part)definitions.push({tokens:tokens.slice(part,at),sql:sql.slice(tokens[part].start,tokens[at-1].end)});
    part=at+1;if(depth===0)break;
   }
  }
  if(depth!==0)throw new Error('Unclosed CREATE TABLE '+name.value);
  let end=at+1;while(end<tokens.length&&tokens[end].value!==';')end++;
  if(end===tokens.length)throw new Error('Unterminated CREATE TABLE '+name.value);
  const constraints=new Set(['CONSTRAINT','PRIMARY','UNIQUE','FOREIGN','CHECK','KEY','INDEX','FULLTEXT','SPATIAL']);
  const columns=definitions.filter(d=>d.tokens[0]?.kind==='word'&&(d.tokens[0].quoted||!constraints.has(d.tokens[0].value.toUpperCase()))).map(d=>({name:d.tokens[0].value,definition:d.sql}));
  tables.push({name:name.value,columns,definitions:definitions.map(d=>d.sql),body:sql.slice(tokens[open].end,tokens[at].start),sql:sql.slice(start,tokens[end].end)});
  i=end;
 }
 return tables;
}
export function extractTriggerEvents(sql) {
 const tokens=schemaTokens(sql),events=[];
 const is=(i,value)=>tokens[i]?.kind==='word'&&tokens[i].value.toUpperCase()===value;
 for(let i=0;i<tokens.length;i++){
  if(!is(i,'CREATE')&&!is(i,'DROP'))continue;const action=tokens[i].value.toUpperCase();let at=i+1;
  if(is(at,'OR')&&is(at+1,'REPLACE'))at+=2;
  if(!is(at++,'TRIGGER'))continue;
  if(is(at,'IF')&&is(at+1,'NOT')&&is(at+2,'EXISTS'))at+=3;
  else if(is(at,'IF')&&is(at+1,'EXISTS'))at+=2;
  if(tokens[at]?.kind!=='word')throw new Error('Unsupported CREATE TRIGGER inventory shape');
  events.push({action,name:tokens[at].value,start:tokens[i].start});
 }
 return events;
}
export function extractTriggerNames(sql) {
 const names=new Set();for(const {action,name}of extractTriggerEvents(sql))if(action==='CREATE')names.add(name);else names.delete(name);
 return [...names];
}
