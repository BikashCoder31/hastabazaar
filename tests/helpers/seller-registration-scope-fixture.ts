import {getManagedMakerApplicationTerms} from '../../lib/db/repositories/managed-maker-details';
import {MANAGED_SUPPLIER_AGREEMENT_VERSION} from '../../lib/sellers/managed-identity';
import assert from 'node:assert/strict';
import {companyStoreMakerFixture} from './company-store-maker-fixture';
import {seedCheckoutBuyer} from './checkout-contact';
import {startSellerRegistration} from '../../lib/db/repositories/seller-commercial-access';

export type RegistrationScopeResponse={registration:{version:number;answers:Record<string,string[]>;editable:boolean;lockedFields?:string[];lockedDocumentKinds?:string[]}};

export const registrationScopeOrigin='https://seller-registration-scope.test';
export async function sellerRegistrationScopeFixture(){
 const f=await companyStoreMakerFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const objects=new Map<string,Uint8Array>(),bucket={async put(key:string,value:Blob){objects.set(key,new Uint8Array(await new Response(value).arrayBuffer()));},async delete(key:string){objects.delete(key);},async get(key:string){const bytes=objects.get(key);return bytes?{body:bytes,size:bytes.length}:null;}}as unknown as R2Bucket;
  globalThis.registrationScopeDb=f.db;globalThis.registrationScopeBucket=bucket;
  for(const[internal,external,email,phone]of [['registration-a','subject-registration-a','registration-a@local.hastabazaar.test','9866666661'],['registration-b','subject-registration-b','registration-b@local.hastabazaar.test','9866666662'],['registration-c','subject-registration-c','registration-c@local.hastabazaar.test','9866666663']]as const){
   await seedCheckoutBuyer(f.db,internal,email,phone,Date.now());f.sqlite.prepare('DELETE FROM account_phone_verifications WHERE user_id=?').run(internal);f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run(external,internal);
   await startSellerRegistration(f.db,{userId:internal,requestId:crypto.randomUUID(),now:Date.now()});
  }
  const select=(id:'registration-a'|'registration-b'|'registration-c')=>{const row=f.sqlite.prepare('SELECT auth_subject,email FROM users WHERE id=?').get(id)!;globalThis.registrationScopeIdentity={userId:String(row.auth_subject),email:String(row.email)};};
  const api=await import('../../app/api/seller-registrations/route');
  const terms=await getManagedMakerApplicationTerms(f.db,Date.now(),MANAGED_SUPPLIER_AGREEMENT_VERSION);
  for(const[actor,type,reference]of [['registration-a','passport','PRIVATE-ORIGINAL-PASSPORT-A'],['registration-b','national_id','PRIVATE-ORIGINAL-NATIONAL-ID-B']]as const){
   select(actor);const data=new FormData();for(const[k,v]of Object.entries({email:globalThis.registrationScopeIdentity!.email,requestId:crypto.randomUUID(),formVersion:'1',hasBusinessTaxRegistration:'no',legalName:'Fictional '+actor,governmentIdType:type,governmentIdDescription:reference,managedAgreementAccepted:'yes',managedAgreementContext:terms.context,managedAgreementVersion:terms.version,applicationAcknowledgement:'yes'}))data.set(k,v);
   const response=await api.POST(new Request(registrationScopeOrigin+'/api/seller-registrations',{method:'POST',headers:{origin:registrationScopeOrigin},body:data}));assert.equal(response.status,201,await response.text());
  }
  select('registration-a');return{...f,bucket,objects,select,api};
 }catch(error){f.dispose();throw error;}
}
