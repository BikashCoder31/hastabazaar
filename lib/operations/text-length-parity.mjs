import {schemaTokens} from './sql-schema-inventory.mjs';
import {buildCheckParity} from './check-parity.mjs';

// SQLite text length stops at U+0000. Keep UTF8 character counting; a binary
// charset delimiter would turn multibyte text into bytes. This collation applies
// only to the delimiter expression and never changes a stored column or index.
export function sqliteTextLengthPredicate(sql){
 const tokens=schemaTokens(sql),replacements=[];
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index];
  if(token.kind!=='word'||token.value.toLowerCase()!=='length'||tokens[index+1]?.value!=='(')continue;
  let depth=1,end=index+2;
  for(;end<tokens.length;end++)if(tokens[end].kind==='symbol'){
   if(tokens[end].value==='(')depth++;
   if(tokens[end].value===')'&&!--depth)break;
  }
  if(depth)throw new Error('Unclosed canonical text length');
  const argument=sql.slice(tokens[index+1].end,tokens[end].start);
  if(/\bAS\s+BLOB\b/i.test(argument))throw new Error('Canonical BLOB byte length is outside text parity');
  replacements.push({start:token.start,end:tokens[end].end,text:`CHAR_LENGTH(SUBSTRING_INDEX(${argument},(CHAR(0 USING utf8mb4) COLLATE utf8mb4_bin),1))`});
  index=end;
 }
 if(!replacements.length)throw new Error('No canonical text length predicate');
 let result=sql;for(const replacement of replacements.toReversed())result=result.slice(0,replacement.start)+replacement.text+result.slice(replacement.end);
 return result;
}

export function buildTextLengthParity(contract,sourceTexts){
 if(contract.corrections?.length)throw new Error('Text length suffix must only add CHECK constraints');
 for(const check of contract.checks){
  if(check.expression!==sqliteTextLengthPredicate(check.canonical))throw new Error('Text length expression differs from canonical source: '+check.name);
  if(!check.nativeClause)throw new Error('Missing calibrated native text length clause: '+check.name);
 }
 if(contract.nativeCalibration?.checks!==contract.checks.length)throw new Error('Missing complete native text length calibration');
 return buildCheckParity(contract,sourceTexts);
}
