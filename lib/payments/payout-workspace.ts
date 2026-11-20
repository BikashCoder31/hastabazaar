import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {assertSimulationAllowed, type RuntimeEnvironment} from '../staging/environment';
import {fundingAvailableSql} from './refund-funding';
import {readPayoutSource, PayoutTransferError, type PayoutModel} from './payout-transfer-sources';
import {livePayoutPartySql} from '../managed-commerce/live-financial-party-sql';
import {paymentGuard} from './manual-receipts';
import {responseScopeContains} from '../orders/response-sql';

class AccessError extends PayoutTransferError {constructor(message:string){super(message,403);}}
interface BeneficiaryDetails {payoutBeneficiary:string;bankName:string;bankBranch:string;bankAccountNumber:string;}
export interface PayoutCandidate {
  recordKind:'live'|'simulation';
  id:string;model:PayoutModel;sellerId:string;sellerName:string;status:string;amountPaisa:number;
  createdAt:number;beneficiaryVersionId:string|null;beneficiaryLabel:string;blocker:string|null;
  privateBeneficiary?:BeneficiaryDetails;
}
export interface PayoutPacketSummary {
  recordKind:'live'|'simulation';
  blocker:string|null;
  id:string;model:PayoutModel;payoutId:string;sellerId:string;sellerName:string;state:string;revision:number;
  amountPaisa:number;preparedAt:number;startedAt:number|null;bankAt:number|null;
  accountVersionId:string;fundingStatementId:string;beneficiaryVersionId:string;
  beneficiaryLabel:string;sourceLabel:string;transactionIdentity:string|null;evidenceReference:string|null;
  privateBeneficiary?:BeneficiaryDetails;personalConflict:boolean;
}
export interface PayoutFundingSummary {
  versionId:string;accountId:string;label:string;statementId:string|null;asOf:number|null;availablePaisa:number|null;
}
const beneficiaryLabel=(details:BeneficiaryDetails|null)=>details
  ?`${details.bankName} · •••• ${details.bankAccountNumber.slice(-4)}`:'Verified original beneficiary needs review';
const companyLabel=(details:string)=>{const d=JSON.parse(details);return `${d.bank} · •••• ${String(d.accountNumber).slice(-4)}`;};

/** A read projection only. No earning, reservation, permission or banking fact is changed here. */
export interface PayoutFinanceSelection{model?:PayoutModel;payoutId?:string;packetId?:string;limit?:number;}
/** Source privacy fence only; callers must independently prove current payout.prepare authority. */
export async function payoutFinanceScopeGuards(db:D1Database,actorId:string,model:PayoutModel,payoutId:string,sellerId:string,accountVersionId?:string,packet?:{id:string;snapshot:string}):Promise<D1PreparedStatement[]|null>{
 let retainedOwner:string|undefined;
 if(packet){
  let source;try{source=JSON.parse(packet.snapshot);}catch{return null;}
  if(!source||source.model!==model||source.id!==payoutId||source.sellerId!==sellerId||typeof source.ownerId!=='string'||!source.ownerId.trim()||source.ownerId===actorId)return null;
  retainedOwner=source.ownerId;
 }
 const predicate=`EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?)`+(model==='managed'?` AND NOT ${livePayoutPartySql('?','?')}`:'')+(accountVersionId?` AND EXISTS(SELECT 1 FROM company_payment_account_versions v WHERE v.id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`:'');
 const retained=packet?` AND ?<>? AND EXISTS(SELECT 1 FROM payout_transfer_packets retained WHERE retained.id=? AND retained.source_snapshot_json=? AND retained.payout_model=? AND retained.seller_id=? AND COALESCE(retained.registered_payout_id,retained.managed_payout_id,retained.supplier_payment_id)=?)`:'';
 const bindings=[sellerId,actorId,...(model==='managed'?[payoutId,actorId,actorId,actorId,actorId]:[]),...(accountVersionId?[accountVersionId,actorId]:[]),...(packet?[retainedOwner!,actorId,packet.id,packet.snapshot,model,sellerId,payoutId]:[])];
 if(!await db.prepare('SELECT 1 WHERE '+predicate+retained).bind(...bindings).first())return null;
 return paymentGuard(db,predicate+retained,bindings);
}
export async function getPayoutFinanceWorkspace(db:D1Database,actorId:string,environment:RuntimeEnvironment,selection:PayoutFinanceSelection={}){
  const authority=await staffMutationGuard(db,actorId,'payout.prepare',AccessError);
  const readLimit=selection.limit??100;
  if(!Number.isSafeInteger(readLimit)||readLimit<1||readLimit>100||selection.packetId&&(selection.payoutId||selection.model)||Boolean(selection.payoutId)!==Boolean(selection.model)||selection.model!==undefined&&!['registered','managed','fixed'].includes(selection.model)||[selection.payoutId,selection.packetId].some(id=>id!==undefined&&(typeof id!=='string'||!id||id.length>191)))throw new PayoutTransferError('Use an exact original payout or instruction.');
  const sourceFilter=selection.packetId?'AND 0':selection.payoutId?'AND source.model=? AND source.id=?':'';
  const superAdmin=authority.role==='super_admin';
  const privacyGuards:D1PreparedStatement[]=[];
  async function eligible(model:PayoutModel,payoutId:string,sellerId:string,accountVersionId?:string,packet?:{id:string;snapshot:string}){
    const guards=await payoutFinanceScopeGuards(db,actorId,model,payoutId,sellerId,accountVersionId,packet);if(!guards)return false;
    privacyGuards.push(...guards);return true;
  }
  let simulationAllowed=false;try{assertSimulationAllowed(environment);simulationAllowed=true;}catch{}
  const original=await db.prepare(`SELECT * FROM (
    SELECT p.id,'registered' AS model,'live' AS recordKind,p.seller_id AS sellerId,p.status,p.amount_paisa AS amountPaisa,p.created_at AS createdAt,p.destination_reference AS destination FROM payouts p
    UNION ALL SELECT p.id,'managed',p.record_kind,p.seller_id,p.status,p.amount_paisa,p.created_at,p.destination_reference FROM managed_payouts p
    UNION ALL SELECT p.id,'fixed','simulation',o.seller_id,p.status,p.amount_paisa,p.created_at,p.destination_reference FROM managed_supplier_payments p JOIN managed_supplier_obligations o ON o.id=p.obligation_id
  ) source WHERE status IN('prepared','scheduled','approved','failed') ${sourceFilter} AND NOT EXISTS(
    SELECT 1 FROM payout_transfer_packets packet WHERE packet.payout_model=source.model
      AND COALESCE(packet.registered_payout_id,packet.managed_payout_id,packet.supplier_payment_id)=source.id AND packet.state NOT IN('failed','void'))
    ORDER BY createdAt,id LIMIT ?`).bind(...selection.payoutId?[selection.model!,selection.payoutId]:[],readLimit+1).all<{id:string;model:PayoutModel;recordKind:'live'|'simulation';sellerId:string;status:string;amountPaisa:number;createdAt:number;destination:string}>();
  const candidatesComplete=original.results.length<=readLimit;original.results=original.results.slice(0,readLimit);
  const candidates:PayoutCandidate[]=[];
  for(const row of original.results){
    if(!await eligible(row.model,row.id,row.sellerId))continue;
    const seller=await db.prepare('SELECT trading_name AS name FROM seller_profiles WHERE id=?').bind(row.sellerId).first<{name:string}>();
    const bank=await db.prepare("SELECT id,details_json AS details FROM seller_beneficiary_versions WHERE seller_id=? AND id=substr(?,13) AND substr(?,1,12)='BENEFICIARY:'")
      .bind(row.sellerId,row.destination,row.destination).first<{id:string;details:string}>();
    const details:BeneficiaryDetails|null=bank?JSON.parse(bank.details):null;
    let blocker:string|null=null;
    if(row.recordKind==='simulation'&&!simulationAllowed)blocker='This route remains limited to approved local simulation.';
    else try{
      await readPayoutSource(db,row.model,row.id,actorId,Date.now());
      const hold=await db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM seller_capability_holds WHERE seller_id=? AND capability='payouts' AND released_at IS NULL)
        OR EXISTS(SELECT 1 FROM seller_payout_review_blocks WHERE payout_model=? AND payout_id=?)`).bind(row.sellerId,row.model,row.id).first();
      if(hold)blocker='A protected identity or bank review is holding this payout. Resolve the original review first.';
    }catch(error){if(error instanceof PayoutTransferError&&error.status===403)continue;blocker=error instanceof PayoutTransferError?error.message:'Review the original earnings, eligibility and retained payment instructions.';}
    const {destination:_,...safe}=row;
    candidates.push({...safe,sellerName:seller?.name??'Seller record needs review',beneficiaryVersionId:bank?.id??null,beneficiaryLabel:beneficiaryLabel(details),blocker,
      ...(superAdmin&&details?{privateBeneficiary:details}:{})});
  }
  const records=await db.prepare(`SELECT p.id,p.payout_model AS model,CASE WHEN p.payout_model='registered' THEN 'live' WHEN p.payout_model='managed' THEN managed.record_kind ELSE 'simulation' END AS recordKind,COALESCE(p.registered_payout_id,p.managed_payout_id,p.supplier_payment_id) AS payoutId,
    p.seller_id AS sellerId,s.trading_name AS sellerName,p.state,p.revision,p.amount_paisa AS amountPaisa,p.prepared_at AS preparedAt,p.started_at AS startedAt,p.bank_at AS bankAt,
    p.account_version_id AS accountVersionId,p.funding_statement_id AS fundingStatementId,p.beneficiary_version_id AS beneficiaryVersionId,
    p.transaction_identity AS transactionIdentity,p.evidence_reference AS evidenceReference,p.source_snapshot_json AS snapshot,b.details_json AS beneficiaryDetails,v.details_json AS sourceDetails,s.user_id=? AS personalConflict
    FROM payout_transfer_packets p JOIN seller_profiles s ON s.id=p.seller_id
    LEFT JOIN managed_payouts managed ON managed.id=p.managed_payout_id
    JOIN seller_beneficiary_versions b ON b.id=p.beneficiary_version_id AND b.seller_id=p.seller_id
    JOIN company_payment_account_versions v ON v.id=p.account_version_id
    WHERE 1=1 ${selection.packetId?'AND p.id=?':selection.payoutId?'AND p.payout_model=? AND COALESCE(p.registered_payout_id,p.managed_payout_id,p.supplier_payment_id)=?':''}
    ORDER BY CASE WHEN p.state IN('processing','uncertain') THEN 0 WHEN p.state IN('prepared','approved') THEN 1 ELSE 2 END,p.prepared_at,p.id LIMIT ?`).bind(actorId,...selection.packetId?[selection.packetId]:selection.payoutId?[selection.model!,selection.payoutId]:[],readLimit+1)
    .all<Omit<PayoutPacketSummary,'beneficiaryLabel'|'sourceLabel'|'privateBeneficiary'|'personalConflict'|'blocker'>&{snapshot:string;beneficiaryDetails:string;sourceDetails:string;personalConflict:number}>();
  const packetsComplete=records.results.length<=readLimit;records.results=records.results.slice(0,readLimit);
  const packets:PayoutPacketSummary[]=[];for(const {snapshot,beneficiaryDetails,sourceDetails,personalConflict,...row} of records.results){
    if(!await eligible(row.model,row.payoutId,row.sellerId,row.accountVersionId,{id:row.id,snapshot}))continue;
    let blocker:string|null=null;
    if(['prepared','approved'].includes(row.state))try{await readPayoutSource(db,row.model,row.payoutId,actorId,Date.now());}catch(error){if(error instanceof PayoutTransferError&&error.status===403)continue;blocker=error instanceof PayoutTransferError?error.message:'Review the retained original payout source.';}
    const details:BeneficiaryDetails=JSON.parse(beneficiaryDetails);
    packets.push({...row,blocker,personalConflict:!!personalConflict,beneficiaryLabel:beneficiaryLabel(details),sourceLabel:companyLabel(sourceDetails),...(superAdmin?{privateBeneficiary:details}:{})});
  }
  const accounts=await db.prepare(`SELECT v.id AS versionId,v.account_id AS accountId,v.details_json AS details,a.statement_id AS statementId,s.as_of AS asOf,${fundingAvailableSql()} AS availablePaisa
    FROM company_payment_account_versions v JOIN company_payment_accounts h ON h.latest_version_id=v.id
    LEFT JOIN company_funding_accounts a ON a.account_id=v.account_id LEFT JOIN company_funding_statements s ON s.id=a.statement_id
    WHERE v.status='verified' ORDER BY v.created_at,v.id`).all<Omit<PayoutFundingSummary,'label'>&{details:string}>();
  const funding:PayoutFundingSummary[]=accounts.results.filter(row=>['both','payment_source'].includes(JSON.parse(row.details).purpose)).map(({details,...row})=>({...row,label:companyLabel(details)}));
  const privateVersions=superAdmin?[...new Set([...candidates.filter(row=>row.privateBeneficiary).map(row=>row.beneficiaryVersionId!),...packets.map(row=>row.beneficiaryVersionId)])]:[];
  await db.batch([...authority.statements,...privacyGuards,...(privateVersions.length?[db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at)
    VALUES(?,?,'payout.transfer.private_review','payout_transfer','workspace',?,${checkoutCommitClock(db)})`).bind(crypto.randomUUID(),actorId,JSON.stringify({beneficiaryVersionIds:privateVersions}))]:[])]);
  return {coverage:{candidatesComplete,packetsComplete},superAdmin,simulationAllowed,candidates,packets,funding};
}
export type PayoutFinanceWorkspace=Awaited<ReturnType<typeof getPayoutFinanceWorkspace>>;
