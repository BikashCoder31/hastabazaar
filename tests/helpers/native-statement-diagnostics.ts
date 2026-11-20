import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
/** Transparent test-only D1 instrumentation. After an actual atomic batch depth
 * failure, EXPLAIN compiles its exact statements/bindings without executing them. */
export function nativeStatementDiagnostics(db:D1Database,path:string,beforeBatch?:(sql:readonly string[])=>Promise<void>):D1Database{
 type Source={statement:D1PreparedStatement;sql:string;bindings:unknown[]};const sources=new WeakMap<D1PreparedStatement,Source>();
 function decorate(statement:D1PreparedStatement,sql:string,bindings:unknown[]=[]):D1PreparedStatement{
  const proxy=new Proxy(statement,{get(target,key){if(key==='bind')return(...values:unknown[])=>decorate(target.bind(...values),sql,values);const value:unknown=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});sources.set(proxy,{statement,sql,bindings});return proxy;
 }
 return new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>decorate(target.prepare(sql),sql);if(key==='batch')return async<T>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{
  try{if(beforeBatch)await beforeBatch(statements.map(statement=>sources.get(statement)?.sql??''));return await target.batch<T>(statements.map(statement=>sources.get(statement)?.statement??statement));}
  catch(error){if(/Expression tree is too large/i.test(String(error))){const failures:Array<{index:number;sql:string;bindCount:number;error:string;groupedEligibility?:{sql:string;compiled:boolean;error?:string};candidates?:Array<{name:string;sql:string;compiled:boolean;error?:string}>;eligibilityTermHashes?:string[]}>=[];for(const[index,statement]of statements.entries()){const source=sources.get(statement);if(!source)continue;try{await target.prepare('EXPLAIN '+source.sql).bind(...source.bindings).all();}catch(explain){const failure:{index:number;sql:string;bindCount:number;error:string;groupedEligibility?:{sql:string;compiled:boolean;error?:string};candidates?:Array<{name:string;sql:string;compiled:boolean;error?:string}>;eligibilityTermHashes?:string[]}={index,sql:source.sql,bindCount:source.bindings.length,error:String(explain)};
 const start=source.sql.indexOf("AND products.status='published'"),end=source.sql.lastIndexOf(') THEN 1 ELSE 0 END');
 if(source.sql.includes('FROM cart_items JOIN products')&&start>=0&&end>start){const candidate=source.sql.slice(0,start)+"AND ("+source.sql.slice(start+4,end)+')'+source.sql.slice(end);try{await target.prepare('EXPLAIN '+candidate).bind(...source.bindings).all();failure.groupedEligibility={sql:candidate,compiled:true};}catch(candidateError){failure.groupedEligibility={sql:candidate,compiled:false,error:String(candidateError)};}}
 if(start>=0&&end>start&&source.sql.includes('WHERE cart_items.id=?')){
  const where=source.sql.indexOf('WHERE cart_items.id=?')+6,terms=source.sql.slice(where,start).trim().split(' AND '),eligibility=source.sql.slice(start+4,end),tail=source.sql.slice(end);
  const balanced=(parts:string[]):string=>parts.length===1?parts[0]:'('+balanced(parts.slice(0,Math.ceil(parts.length/2)))+' AND '+balanced(parts.slice(Math.ceil(parts.length/2)))+')';
  if(terms.length===7&&!eligibility.includes('?')){
   const eligibilityTerms=splitConjunction(eligibility);failure.eligibilityTermHashes=eligibilityTerms.map(term=>createHash('sha256').update(term).digest('hex'));if(eligibilityTerms.length!==9)throw new Error('Expected exact nine generated public eligibility conjunction terms.');
   const candidates=[{name:'balanced_complete_eligibility_original_guard',sql:source.sql.slice(0,start+4)+balanced(eligibilityTerms)+tail,bindings:source.bindings},{name:'balanced_cart_grouped_eligibility',sql:source.sql.slice(0,where)+balanced(terms)+' AND ('+eligibility+')'+tail,bindings:source.bindings},{name:'separate_original_cart_guard',sql:source.sql.slice(0,where)+source.sql.slice(where,start).trim()+tail,bindings:source.bindings},{name:'separate_exact_product_eligibility_guard',sql:'INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM products WHERE products.id=? AND ('+eligibility+')) THEN 1 ELSE 0 END',bindings:[source.bindings[0],source.bindings[3]]}];
   failure.candidates=[];for(const candidate of candidates){try{await target.prepare('EXPLAIN '+candidate.sql).bind(...candidate.bindings).all();failure.candidates.push({name:candidate.name,sql:candidate.sql,compiled:true});}catch(candidateError){failure.candidates.push({name:candidate.name,sql:candidate.sql,compiled:false,error:String(candidateError)});}}
  }
 }

 failures.push(failure);}}await writeFile(path,JSON.stringify(failures,null,2));console.error('Exact native statement compilation failures:',JSON.stringify(failures.map(({index,sql,bindCount,error,groupedEligibility,candidates})=>({index,sqlHead:sql.slice(0,250),sqlBytes:sql.length,bindCount,error,groupedEligibilityCompiled:groupedEligibility?.compiled,groupedEligibilityError:groupedEligibility?.error,candidates:candidates?.map(({name,compiled,error})=>({name,compiled,error}))}))));}throw error;}
 };const value:unknown=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
}

/** Test-only lexical split: quoted SQL literals/identifiers and nested subqueries
 * remain byte-identical. No SQL is parsed or rewritten in production. */
function splitConjunction(sql:string){
 const parts:string[]=[];let depth=0,quote='',start=0;
 for(let i=0;i<sql.length;i++){
  const character=sql[i];if(quote){if(character===quote){if(sql[i+1]===quote)i++;else quote='';}continue;}
  if(character==="'"||character==='"'||character==='`'){quote=character;continue;}
  if(character==='('){depth++;continue;}if(character===')'){depth--;if(depth<0)throw new Error('Unbalanced diagnostic SQL.');continue;}
  if(depth===0&&sql.slice(i,i+3)==='AND'&&/\s/.test(sql[i-1]??'')&&/\s/.test(sql[i+3]??'')){parts.push(sql.slice(start,i).trim());start=i+3;i+=2;}
 }
 if(quote||depth!==0)throw new Error('Unclosed diagnostic SQL.');parts.push(sql.slice(start).trim());if(parts.some(part=>!part))throw new Error('Empty diagnostic term.');return parts;
}
