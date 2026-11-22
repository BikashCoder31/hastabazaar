import {readFixedPayoutSource} from './payout-transfer-fixed';
import {paymentGuard} from './manual-receipts';
import {verifiedIdentitySql,protectedPayoutGuards} from '../sellers/protected-change-policy';
import {payoutRegistrationBlocker,payoutRegistrationGuards} from './payout-registration-readiness';

import {PayoutTransferError,type PayoutModel,type PayoutSource} from './payout-transfer-types';
export {PayoutTransferError,type PayoutModel,type PayoutSource} from './payout-transfer-types';
import {readManagedPayoutSource} from './payout-transfer-managed';

/** Only native, currently payable earnings are bound. Historical bank strings require review. */
export async function readPayoutSource(db:D1Database,model:PayoutModel,id:string,actorId:string,now:number):Promise<PayoutSource>{
 const source=await readNativePayoutSource(db,model,id,actorId,now);
 const blocker=await payoutRegistrationBlocker(db,source.sellerId,model,now);
 if(blocker)throw new PayoutTransferError(blocker);
 return {...source,guards:[...payoutRegistrationGuards(db,source.sellerId,model),...source.guards]};
}

async function readNativePayoutSource(db:D1Database,model:PayoutModel,id:string,actorId:string,now:number):Promise<PayoutSource>{
 if(model==='fixed')return readFixedPayoutSource(db,id,actorId,now);
 if(model==='managed')return readManagedPayoutSource(db,id,actorId,now);
 if(model!=='registered')throw new PayoutTransferError('Open the native managed settlement execution workflow.');
 const p=await db.prepare(`SELECT p.id,p.seller_id AS sellerId,s.user_id AS ownerId,p.status,p.amount_paisa AS amountPaisa,p.destination_reference AS destination,
  b.id AS beneficiaryVersionId,v.identity_revision AS identityRevision,v.bank_revision AS bankRevision
  FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id JOIN seller_protected_revisions v ON v.seller_id=s.id
  JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(p.destination_reference,13) AND substr(p.destination_reference,1,12)='BENEFICIARY:'
  JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id
  WHERE p.id=? AND s.payout_account_reference=p.destination_reference AND b.identity_revision=v.identity_revision
  AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>?)
  AND ${verifiedIdentitySql('s.id',now)}`).bind(id,now).first<{id:string;sellerId:string;ownerId:string;status:string;amountPaisa:number;destination:string;beneficiaryVersionId:string;identityRevision:number;bankRevision:number}>();
 if(!p||!['prepared','scheduled','approved','failed'].includes(p.status))throw new PayoutTransferError('Review the original payable earnings and a current verified beneficiary tied to the actual identity.');
 if(p.ownerId===actorId)throw new PayoutTransferError('An eligible operator without a personal beneficiary interest must handle this payout.',403);
 if(p.status==='failed'&&!await db.prepare("SELECT 1 FROM payout_transfer_packets WHERE registered_payout_id=? AND state='failed'").bind(id).first())throw new PayoutTransferError('Reconcile the unknown historical bank outcome before preparing another instruction.');
 const entries=await db.prepare(`SELECT e.id,e.amount_paisa AS amount,e.type,e.available_at AS availableAt FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id
  WHERE pe.payout_id=? AND pe.released_at IS NULL ORDER BY e.id`).bind(id).all<{id:string;amount:number;type:string;availableAt:number}>();
 const debtSql="COALESCE((SELECT SUM(e.amount_paisa) FROM seller_ledger_entries e WHERE e.seller_id=? AND e.amount_paisa<0 AND NOT EXISTS(SELECT 1 FROM payout_entries pe WHERE pe.ledger_entry_id=e.id AND pe.released_at IS NULL)),0)";
 const debt=(await db.prepare('SELECT '+debtSql+' AS amount').bind(p.sellerId).first<{amount:number}>())!.amount;
 if(!entries.results.length||entries.results.some(e=>e.availableAt>now)||entries.results.reduce((n,e)=>n+e.amount,0)!==p.amountPaisa||debt<0)throw new PayoutTransferError('Reconcile changed earnings, refund offsets and the exact original reserved entries before paying.');
 const snapshot=JSON.stringify({model,id:p.id,sellerId:p.sellerId,ownerId:p.ownerId,amountPaisa:p.amountPaisa,destination:p.destination,identityRevision:p.identityRevision,bankRevision:p.bankRevision,entries:entries.results,debt});
 const guards=[db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(p.sellerId),
  ...protectedPayoutGuards(db,p.sellerId,actorId,{id:p.id,model:'registered'}),
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN seller_beneficiary_versions b ON b.id=substr(p.destination_reference,13) AND substr(p.destination_reference,1,12)='BENEFICIARY:' AND b.seller_id=s.id JOIN seller_documents d ON d.id=b.document_id WHERE p.id=? AND p.status=? AND p.amount_paisa=? AND s.user_id=? AND s.payout_account_reference=? AND v.identity_revision=? AND v.bank_revision=? AND b.id=? AND b.identity_revision=v.identity_revision AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>?) AND ${verifiedIdentitySql('s.id',now)})`,[p.id,p.status,p.amountPaisa,p.ownerId,p.destination,p.identityRevision,p.bankRevision,p.beneficiaryVersionId,now]),
  ...paymentGuard(db,`(SELECT COUNT(*) FROM payout_entries WHERE payout_id=? AND released_at IS NULL)=? AND ${debtSql}=?`,[id,entries.results.length,p.sellerId,debt]),
  ...entries.results.flatMap(e=>paymentGuard(db,'EXISTS(SELECT 1 FROM payout_entries pe JOIN seller_ledger_entries e ON e.id=pe.ledger_entry_id WHERE pe.payout_id=? AND pe.released_at IS NULL AND e.id=? AND e.seller_id=? AND e.amount_paisa=? AND e.type=? AND e.available_at=?)',[id,e.id,p.sellerId,e.amount,e.type,e.availableAt]))];
 return {model,...p,snapshot,guards};
}
