import {readFileSync} from 'node:fs';

// Read reviewed source definitions, never execute a migration or open a database.
function statements(file){return readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8').split('--> statement-breakpoint').map(part=>part.slice(part.search(/\b(?:CREATE|ALTER|INSERT|DROP)\b/)).trim());}
function definition(file,name){
 const found=statements(file).filter(sql=>new RegExp('^CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER) (?:IF NOT EXISTS )?[`"]?'+name+'[`"]?(?:\\s|\\()').test(sql));
 if(found.length!==1)throw Error('Ambiguous reviewed form storage definition: '+name);
 return found[0].replace(/^(CREATE (?:UNIQUE )?(?:TABLE|INDEX|TRIGGER)) IF NOT EXISTS /,'$1 ');
}
/** Whole-definition comparison: preserve literals/operators/grouping; reject unknown syntax. */
export function sameCoreStorageDefinition(actual,expected){
 function tokens(value){
  if(typeof value!=='string')return null;
  const source=value.trim().replace(/;$/,'');
  const pattern=/\s+|'(?:''|[^'\\])*'|`[a-z_][a-z0-9_]*`|"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*|\d+|\|\||<>|!=|<=|>=|[=<>(),;.+-]/giy;
  const result=[];let cursor=0;
  while(cursor<source.length){pattern.lastIndex=cursor;const match=pattern.exec(source);if(!match)return null;const token=match[0];if(!/^\s+$/.test(token))result.push(token.startsWith("'")?token:token.replaceAll('`','').replaceAll('"','').toLowerCase());cursor=pattern.lastIndex;}
  return JSON.stringify(result);
 }
 const left=tokens(actual),right=tokens(expected);return left!==null&&right!==null&&left===right;
}
function checkDefinition(sqlite,problems,kind,name,expected){
 const actual=sqlite.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get(kind,name)?.sql;
 if(!actual)problems.push('missing '+name);
 else if(!sameCoreStorageDefinition(actual,expected))problems.push('unrecognized '+name+' definition');
}
export function inspectCoreReceiptStorage(sqlite){
 const problems=[];
 const audit=sqlite.prepare('PRAGMA table_info(audit_logs)').all();
 for(const name of ['id','actor_id','action','subject_type','subject_id','request_id','previous_json','next_json','created_at','command_key','command_digest','command_result_json'])if(!audit.some(row=>row.name===name))problems.push('missing audit_logs.'+name);
 if(!audit.some(row=>row.name==='id'&&row.pk===1&&String(row.type).toUpperCase()==='TEXT'))problems.push('audit_logs.id must retain its text primary key');
 if(!audit.some(row=>row.name==='action'&&row.notnull===1))problems.push('audit_logs.action must remain NOT NULL');
 checkDefinition(sqlite,problems,'table','operation_transaction_guards',definition('0029_parcel_operations.sql','operation_transaction_guards'));
 checkDefinition(sqlite,problems,'table','form_config_versions',definition('0056_form_catalog.sql','form_config_versions'));
 const answers=sqlite.prepare('PRAGMA table_info(form_answer_sets)').all();
 for(const name of ['id','form_id','request_id','config_version_id','subject_type','subject_id','actor_id','answers_json','created_at'])if(!answers.some(row=>row.name===name))problems.push('missing form_answer_sets.'+name);
 for(const [file,kind,names] of [
  ['0056_form_catalog.sql','trigger',['trg_form_config_versions_published_update','trg_form_config_versions_published_delete']],
  ['0056_form_catalog.sql','index',['idx_form_answer_sets_form_request']],
  ['0079_complete_version_foundation.sql','index',['audit_command_key_unique']],
  ['0079_complete_version_foundation.sql','trigger',['audit_command_complete','audit_command_no_update','audit_command_no_delete']],
  ['0081_core_form_receipt_retention.sql','trigger',['core_form_receipt_no_update','core_form_receipt_no_delete']],
 ])for(const name of names)checkDefinition(sqlite,problems,kind,name,definition(file,name));
 return problems;
}
export function inspectPublicCoreReceiptStorage(sqlite){
 const problems=[],file='0154_native_public_feedback_defaults.sql';
 const table=definition(file,'feedback_delivery_jobs_native_defaults').replace('feedback_delivery_jobs_native_defaults','feedback_delivery_jobs');
 checkDefinition(sqlite,problems,'table','feedback_delivery_jobs',table);
 for(const name of ['feedback_native_origin_insert','feedback_native_origin_update','feedback_native_facts_immutable','feedback_native_proof_immutable','feedback_native_proof_retained'])checkDefinition(sqlite,problems,'trigger',name,definition(file,name));
 return problems;
}
export function inspectPublishedReceiptStorage(sqlite){
 const problems=inspectCoreReceiptStorage(sqlite);
 const columns=sqlite.prepare('PRAGMA table_info(form_answer_sets)').all();
 for(const name of ['health_environment','health_release_id'])if(!columns.some(row=>row.name===name))problems.push('missing form_answer_sets.'+name);
 return problems;
}
