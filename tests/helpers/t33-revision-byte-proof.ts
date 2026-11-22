import assert from 'node:assert/strict';
/** Real SQLite/D1 updates, with exact original field restoration and monotonic derived versions. */
export async function t33RevisionByteProof(db:D1Database){
 const id='t33legacy-seller',checks:{name:string;before:number;after:number;expectedAfter:number}[]=[];
 const current=async(column:string)=>{const row=await db.prepare('SELECT '+column+' value FROM seller_profiles WHERE id=?').bind(id).first<{value:string|null}>();assert.ok(row);return row.value;};
 const revision=async(counter:string)=>Number((await db.prepare('SELECT '+counter+' n FROM seller_protected_revisions WHERE seller_id=?').bind(id).first<{n:number}>())!.n);
 const update=async(column:string,value:string|null)=>{await db.prepare('UPDATE seller_profiles SET '+column+'=? WHERE id=?').bind(value,id).run();assert.equal(await current(column),value);};
 async function probe(name:string,column:string,counter:string,value:string|null,increment:number,setup?:()=>Promise<void>){const original=await current(column);try{if(setup)await setup();const before=await revision(counter);await update(column,value);const after=await revision(counter);checks.push({name,before,after,expectedAfter:before+increment});assert.equal(after,before+increment,name);}finally{await update(column,original);}}
 for(const[column,counter]of [['legal_name','identity_revision'],['payout_account_reference','bank_revision']]as const){const original=await current(column);assert.equal(typeof original,'string');assert.ok(original);const changed=original.replace(/[a-zA-Z]/,letter=>letter===letter.toUpperCase()?letter.toLowerCase():letter.toUpperCase());assert.notEqual(changed,original);await probe(column+'_case_only',column,counter,changed,1);await probe(column+'_trailing_space',column,counter,original+' ',1);await probe(column+'_unchanged',column,counter,original,0);}
 await probe('bank_string_to_null','payout_account_reference','bank_revision',null,1);await probe('bank_null_to_empty','payout_account_reference','bank_revision','',1,async()=>{await update('payout_account_reference',null);});return checks;
}
