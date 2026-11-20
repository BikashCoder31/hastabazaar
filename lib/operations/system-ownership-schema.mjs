import {mariaGovernanceSchema} from './governance-schema.mjs';

/** The additive ownership trigger retains SQLite's scalar/null and binary identity tests. */
export function mariaSystemOwnershipSchema(source){
 let sql=source.replace(/\r\n/g,'\n')
  .replace(/json_type\(a\.command_result_json,'\$\.system'\)='true'/g,"JSON_TYPE(JSON_EXTRACT(a.command_result_json,'$.system'))='BOOLEAN'")
  .replace(/json_extract\(a\.command_result_json,'\$\.system'\)=1/g,"JSON_CONTAINS(a.command_result_json,'true','$.system')=1")
  .replace(/json_extract\(/g,'JSON_VALUE(')
  .replace(/NEW\.revision<>OLD\.revision\+1/g,'NEW.revision<>(OLD.revision+1)');
 const atom="(?:JSON_VALUE\\([^)]*\\)|(?:NEW|OLD|a|e|t)\\.\\w+)";
 sql=sql.replace(new RegExp('('+atom+')\\s+IS\\s+(NOT\\s+)?('+atom+')','g'),(_all,left,not,right)=>(not?'NOT':'')+'(BINARY '+left+'<=>BINARY '+right+')');
 sql=sql.replace(new RegExp('('+atom+')\\s*(<>|=)\\s*('+atom+"|'[^']*')"+'(?![\\w.]|\\s*[+*/-])','g'),(_all,left,operator,right)=>'BINARY '+left+operator+'BINARY '+right);
 const checked=sql.replace(/JSON_TYPE\(JSON_EXTRACT\(a\.command_result_json,'\$\.system'\)\)='BOOLEAN'/g,'');
 if(/json_extract|\bIS\s+(?:NOT\s+)?(?:NEW|OLD|a|e|t)\./i.test(checked))throw new Error('Unmapped system ownership comparison.');
 return mariaGovernanceSchema(sql);
}
