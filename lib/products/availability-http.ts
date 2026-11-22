import {productMutationBoundary,intakeErrorReply,intakeFailure} from './intake-http';
import {validOfferId} from './offer-contracts';
import {getProductAvailability,changeProductAvailability,type ProductAvailabilityInput} from './availability';
import {confirmOfferStock,pauseOfferStock,moveOfferStock} from './offer-inventory';
import {closedIntakeFields,intakeCommand,intakeId,intakeQuery,intakeReply,intakeActor} from './intake-http';
import {OfferError} from './offer-support';
import {readBoundedJsonObject} from '../http/form-json-body';
import {isTrustedMutationRequest} from '../http/request-security';
export async function readAvailabilityHttp(request:Request,db:D1Database,actorId:string,scope:'owner'|'staff'){intakeActor(request,actorId);const query=intakeQuery(request,['productId']),id=query.get('productId');if(!intakeId(id))throw new OfferError('Choose the exact saved product.',400);const view=await getProductAvailability(db,actorId,id,Date.now());if(view.owner!==(scope==='owner'))throw new OfferError('Use the workspace for your exact owner or independent staff role.',403);return intakeReply(view);}
export async function mutateAvailabilityHttp(request:Request,db:D1Database,actorId:string,scope:'owner'|'staff'){
 const boundary=productMutationBoundary();
 if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');
 try{const body=await readBoundedJsonObject(request),ctx=intakeCommand(body,actorId,request);if(!intakeId(body.productId)||typeof body.reason!=='string')throw new OfferError('Choose the exact product and record the availability reason.',400);
 if(scope==='owner'&&['confirm_stock','pause_offer','move_stock'].includes(String(body.action))){
  const fields=body.action==='confirm_stock'?['offerId','available','independentStockConfirmed']:body.action==='pause_offer'?['offerId','paused','publicVersionId']:['fromOfferId','toOfferId','fromQuantity','toQuantity','toRevision','samePhysicalStockConfirmed'];closedIntakeFields(body,['action','productId','requestId','expectedRevision','reason',...fields]);
  for(const id of body.action==='move_stock'?[body.fromOfferId,body.toOfferId]:[body.offerId])if(!validOfferId(id)||!await db.prepare('SELECT 1 FROM product_offer_identities WHERE id=? AND product_id=?').bind(id,body.productId).first())throw new OfferError('Choose an actual physical offer belonging to this product.',400);
  if(body.action==='confirm_stock'){boundary.begin();return intakeReply(await confirmOfferStock(db,ctx,{offerId:body.offerId as string,available:body.available as number,reason:body.reason,independentStockConfirmed:body.independentStockConfirmed===true}));}
  if(body.action==='pause_offer'){boundary.begin();return intakeReply(await pauseOfferStock(db,ctx,{offerId:body.offerId as string,paused:body.paused as boolean,reason:body.reason,publicVersionId:body.publicVersionId as string|undefined}));}
  boundary.begin();return intakeReply(await moveOfferStock(db,ctx,{fromOfferId:body.fromOfferId as string,toOfferId:body.toOfferId as string,fromQuantity:body.fromQuantity as number,toQuantity:body.toQuantity as number,toRevision:body.toRevision as number,samePhysicalStockConfirmed:body.samePhysicalStockConfirmed===true,reason:body.reason}));
 }
 closedIntakeFields(body,['action','productId','requestId','expectedRevision','reason','publicVersionId']);if(typeof body.action!=='string'||!body.action.startsWith(scope+'_')||body.publicVersionId!==undefined&&!intakeId(body.publicVersionId))throw new OfferError('Use the supported action for your own availability scope.',400);
 const {requestId,expectedRevision,...input}=body;void requestId;void expectedRevision;boundary.begin();return intakeReply(await changeProductAvailability(db,ctx,input as unknown as ProductAvailabilityInput));
 }catch(error){return intakeFailure(error,boundary.phase);}
}
