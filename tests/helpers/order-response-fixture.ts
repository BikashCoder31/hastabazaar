import {manualOrderFixture} from './manual-payment-fixture';
import {allocateBankReceipt,recordBankReceipt} from '../../lib/payments/manual-receipts';
export async function actionableOrderFixture(options:{secondOffer?:boolean;beforeRelease?:(fixture:Awaited<ReturnType<typeof manualOrderFixture>>)=>void|Promise<void>}={}){
 const f=await manualOrderFixture(options);try{
  await options.beforeRelease?.(f);
  const ctx={actorId:'reviewer',requestId:'actionable-credit',expectedRevision:null,now:Date.now()},credit=await recordBankReceipt(f.db,ctx,{accountVersionId:f.accountVersionId,transactionIdentity:'FICTIONAL-ACTIONABLE-CREDIT',bankAt:f.now,amountMinor:f.order.grandTotalPaisa,currency:'NPR',payerReference:'Fictional exact customer',payerUserId:'customer',evidenceReference:'FICTIONAL-COMPLETED-ACTIONABLE-CREDIT',completedCreditConfirmed:true,conflictUserIds:[],reason:'Independently verify fictional company receipt before actual release.'});
  await allocateBankReceipt(f.db,{...ctx,requestId:'actionable-allocation',expectedRevision:'0'},{receiptId:credit.id,orderId:f.orderId,amountPaisa:f.order.grandTotalPaisa,expectedWindowRevision:0,matchingBasis:'Original bank account, customer and order independently matched.',exceptionApproval:null});
  const rows=f.sqlite.prepare('SELECT r.order_item_id AS id,r.portion_id AS portionId,r.released_at AS releasedAt,i.seller_id AS sellerId FROM order_response_items r JOIN order_items i ON i.id=r.order_item_id WHERE i.order_id=? ORDER BY i.id').all(f.orderId),releasedAt=Number(rows[0].releasedAt);let now=releasedAt;
  f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
  return {...f,rows,releasedAt,setClock(value:number){now=value;}};
 }catch(error){f.dispose();throw error;}
}
