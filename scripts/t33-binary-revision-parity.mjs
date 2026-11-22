import assert from 'node:assert/strict';
/** Actual source triggers on the real full schema; injected changes roll back after each observation. */
export async function verifyT33BinaryRevisionParity(connection){
 const [scope]=await connection.query('SELECT DATABASE()name');assert.match(scope[0].name,/^fixture_[a-f0-9]{8}_t33(?:par)?_[a-z0-9_]+$/);
 const id='t33legacy-seller',[[original]]=await connection.execute('SELECT legal_name,payout_account_reference FROM seller_profiles WHERE id=?',[id]);assert.ok(original);const checks=[];
 const revision=async column=>Number((await connection.execute('SELECT '+column+' n FROM seller_protected_revisions WHERE seller_id=?',[id]))[0][0].n);
 async function probe(name,column,counter,value,expectedIncrement,setup){await connection.beginTransaction();try{if(setup)await setup();const before=await revision(counter),[[prior]]=await connection.execute('SELECT '+column+' value FROM seller_profiles WHERE id=?',[id]);await connection.execute('UPDATE seller_profiles SET '+column+'=? WHERE id=?',[value,id]);const after=await revision(counter),[[stored]]=await connection.execute('SELECT '+column+' value FROM seller_profiles WHERE id=?',[id]);assert.equal(stored.value,value,'The intended byte-level fixture change must really be stored.');checks.push({name,column,byteChanged:prior.value!==stored.value,before,after,expectedAfter:before+expectedIncrement,passed:after===before+expectedIncrement});}finally{await connection.rollback();}}
 const swapFirst=value=>value.replace(/[a-zA-Z]/,letter=>letter===letter.toUpperCase()?letter.toLowerCase():letter.toUpperCase());
 for(const[column,counter,value]of [['legal_name','identity_revision',original.legal_name],['payout_account_reference','bank_revision',original.payout_account_reference]]){assert.equal(typeof value,'string');assert.notEqual(swapFirst(value),value);await probe(column+'_case_only',column,counter,swapFirst(value),1);await probe(column+'_trailing_space',column,counter,value+' ',1);await probe(column+'_unchanged',column,counter,value,0);}
 await probe('bank_string_to_null','payout_account_reference','bank_revision',null,1);await probe('bank_null_to_empty','payout_account_reference','bank_revision','',1,async()=>{await connection.execute('UPDATE seller_profiles SET payout_account_reference=NULL WHERE id=?',[id]);});
 return{allPassed:checks.every(check=>check.passed),checks};
}
