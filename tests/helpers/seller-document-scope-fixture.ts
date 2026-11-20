import assert from 'node:assert/strict';
import {sellerRegistrationScopeFixture,registrationScopeOrigin as origin,type RegistrationScopeResponse} from './seller-registration-scope-fixture';

/** Genuine optional upload in an isolated owned application; no approval/activation. */
export async function sellerDocumentScopeFixture(){
 const f=await sellerRegistrationScopeFixture();try{
  f.select('registration-b');const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([300,400]).drawText('Synthetic owned identity evidence');const bytes=await pdf.save({useObjectStreams:false});
  const get=await f.api.GET(new Request(origin+'/api/seller-registrations',{headers:{'X-Hastabazaar-Actor':'registration-b'}}));assert.equal(get.status,200);const record=(await get.json()as RegistrationScopeResponse).registration;
  const {registrationEmail,...answers}=record.answers;
  const data=new FormData();for(const[key,values]of Object.entries(answers))for(const value of values)data.append(key,value);for(const[key,value]of Object.entries({email:registrationEmail?.[0]??'registration-b@local.hastabazaar.test',revision:String(record.version),requestId:crypto.randomUUID(),formVersion:'1'}))data.set(key,value);
  data.set('representativeIdentity',new File([new Uint8Array(bytes)],'synthetic-original-identity.pdf',{type:'application/pdf'}));const saved=await f.api.PUT(new Request(origin+'/api/seller-registrations',{method:'PUT',headers:{origin,'X-Hastabazaar-Actor':'registration-b'},body:data}));assert.equal(saved.status,200,await saved.text());
  const document=f.sqlite.prepare("SELECT d.id,d.seller_id AS sellerId FROM seller_documents d JOIN seller_profiles p ON p.id=d.seller_id WHERE p.user_id='registration-b' AND d.kind='representative_identity'").get()!;
  const correction=()=>{const data=new FormData();data.set('commandId',crypto.randomUUID());data.set('document',new File([new Uint8Array(bytes)],'synthetic-correction.pdf',{type:'application/pdf'}));return data;};
  return{...f,document:{id:String(document.id),sellerId:String(document.sellerId)},correction};
 }catch(error){f.dispose();throw error;}
}
