import {verifySellerDocument} from '../../lib/sellers/document-review';
import {getRegisteredSellerTerms,prepareSellerCommissionAcceptance} from '../../lib/db/repositories/marketplace-settings';
import type {completeVersionFixture} from './complete-version-fixture';
/** Only fictional, in-memory fixtures. Never accepts a file or database path. */
export async function readyRegisteredSeller(f:Awaited<ReturnType<typeof completeVersionFixture>>,company=false){
 if(f.sqlite.prepare('PRAGMA database_list').all().some(row=>row.file!==''))throw new Error('Readiness fixtures must be in memory.');
 if(!company)f.sqlite.exec("UPDATE seller_profiles SET applicant_type='individual' WHERE id='registered'");
 if(company)f.sqlite.exec("UPDATE seller_profiles SET applicant_type='company',legal_name='Fictional Registered Company' WHERE id='registered'");
 for(const kind of ['representative_identity','pan_certificate',...(company?['business_registration']:[])]){const id='public-fixture-'+kind;f.sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,'registered',?,?,'fictional.png','image/png',20,'pending',?)").run(id,kind,'private/seller-documents/registered/'+id,f.now+5);await verifySellerDocument(f.db,{sellerId:'registered',documentId:id,actorId:'reviewer',reason:'Review this exact fictional evidence against the fictional applicant.',commandId:'verify-'+id,now:f.now+6,expectedReviewId:null});}
 const terms=await getRegisteredSellerTerms(f.db,f.now+7),acceptance=await prepareSellerCommissionAcceptance(f.db,{sellerId:'registered',actorId:'registered-owner',context:terms.context,requestId:'public-fixture-terms',now:f.now+7,mode:'approved_seller'});await f.db.batch([f.db.prepare("UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=?,updated_at=? WHERE id='registered'").bind(terms.agreementVersion,f.now+7,f.now+7),...acceptance.statements]);
}
