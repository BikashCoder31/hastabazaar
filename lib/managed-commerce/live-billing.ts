import {financialNoticeStatements} from '../operations/financial-notices';
import {financialNoticeIdentity} from '../operations/financial-notice-sources';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {paymentGuard} from '../payments/manual-receipts';
import {companyDetails} from '../content/company-details';
import {getEffectiveBusinessSetting} from '../db/repositories/business-settings';
import {ManagedLiveFinancialError} from './live-financial-errors';
import {liveInvoicePartySql} from './live-financial-parties';
export {ManagedLiveFinancialError} from './live-financial-errors';

export const LIVE_MANAGED_INVOICE_MODEL='company_commercial_invoice_v1' as const;
export interface ManagedLiveIssuer {legalName:string;taxMode:string;taxRegistrationNumber:string;address:string;phone:string}
type Scope={id:string;companyEntityReference:string;companyScopeDigest:string;issuerModel:typeof LIVE_MANAGED_INVOICE_MODEL;issuerScopeDigest:string;issuerSnapshotJson:string;seriesPrefix:string;seriesVersion:string;openingNumber:number;reviewedBy:string};
const scopeColumns='f.id,f.company_entity_reference AS companyEntityReference,f.company_scope_digest AS companyScopeDigest,f.issuer_model AS issuerModel,f.issuer_scope_digest AS issuerScopeDigest,f.issuer_snapshot_json AS issuerSnapshotJson,f.series_prefix AS seriesPrefix,f.series_version AS seriesVersion,f.opening_number AS openingNumber,f.reviewed_by AS reviewedBy';
function text(value:string,label:string,min=3,max=191){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new ManagedLiveFinancialError('Review '+label+'.');return value.trim();}
function digest(value:string){if(!/^[a-f0-9]{64}$/.test(value))throw new ManagedLiveFinancialError('Review the exact original company scope.');return value;}
export async function recordManagedLiveFinancialScope(db:D1Database,ctx:CommandContext,input:{companyEntityReference:string;companyScopeDigest:string;issuerModel:typeof LIVE_MANAGED_INVOICE_MODEL;issuer:ManagedLiveIssuer;seriesPrefix:string;seriesVersion:string;openingNumber:number;evidenceReference:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'business_settings.approve',ManagedLiveFinancialError,'super_admin');
 const receipt=await commandReceipt(db,ctx,{action:'managed.live.financial_scope.recorded',subjectType:'managed_live_financial_scope',subjectId:input.companyEntityReference},input);
 if(receipt.replayed)return receipt.result as {id:string;issuerScopeDigest:string};
 if(ctx.expectedRevision!==null||!Number.isSafeInteger(ctx.now)||ctx.now<=0)throw new ManagedLiveFinancialError('Use a fresh exact financial scope command.');
 if(input.issuerModel!==LIVE_MANAGED_INVOICE_MODEL)throw new ManagedLiveFinancialError('This actual invoice model has not been implemented.');
 const issuer=Object.fromEntries(Object.entries(input.issuer).map(([key,value])=>[key,text(value,'declared issuer '+key)])) as unknown as ManagedLiveIssuer;
 if(Object.keys(issuer).sort().join(',')!=='address,legalName,phone,taxMode,taxRegistrationNumber')throw new ManagedLiveFinancialError('Record the exact declared commercial issuer fields.');
 if(issuer.taxMode!=='PAN'||!/^\d{9}$/.test(issuer.taxRegistrationNumber))throw new ManagedLiveFinancialError('The implemented commercial invoice format requires explicitly cleared PAN-format issuer facts. Other tax formats need their own implemented format.');
 const prefix=text(input.seriesPrefix,'actual invoice series prefix',3,60);
 if(!/^[A-Z0-9][A-Z0-9-]*$/.test(prefix)||prefix.startsWith('SIM'))throw new ManagedLiveFinancialError('Choose the independently approved actual invoice series.');
 if(!Number.isSafeInteger(input.openingNumber)||input.openingNumber<1)throw new ManagedLiveFinancialError('Record the approved actual opening number.');
 text(input.companyEntityReference,'company entity');digest(input.companyScopeDigest);text(input.seriesVersion,'series version');text(input.evidenceReference,'external model and numbering evidence',10,1000);text(input.reason,'independent financial review reason',10,1000);
 const company=await getEffectiveBusinessSetting(db,'managed_maker_company_account',ctx.now),companyScopeDigest=await digestFormRequest({company:{...companyDetails},entityReference:company.value.entityReference});
 if(input.companyEntityReference!==company.value.entityReference||input.companyScopeDigest!==companyScopeDigest||issuer.legalName!==companyDetails.legalName||issuer.taxRegistrationNumber!==companyDetails.pan||issuer.address!==companyDetails.registeredOffice)throw new ManagedLiveFinancialError('Review the exact actual company issuer from the current accepted-offer identity source.');
 const id=crypto.randomUUID(),issuerScopeDigest=await digestFormRequest({model:input.issuerModel,companyEntityReference:input.companyEntityReference,companyScopeDigest:input.companyScopeDigest,issuer,seriesPrefix:prefix,seriesVersion:input.seriesVersion,openingNumber:input.openingNumber});
 const result={id,issuerScopeDigest};
 try{await db.batch([...authority.statements,
  ...paymentGuard(db,"COALESCE((SELECT id FROM business_setting_versions WHERE setting_key='managed_maker_company_account' AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?",[ctx.now,ctx.now,company.versionId??'']),
  db.prepare('INSERT INTO managed_live_financial_scopes(id,company_entity_reference,company_scope_digest,issuer_model,issuer_scope_digest,issuer_snapshot_json,series_prefix,series_version,opening_number,evidence_reference,reviewed_by,reviewed_at,request_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.companyEntityReference,input.companyScopeDigest,input.issuerModel,issuerScopeDigest,JSON.stringify(issuer),prefix,input.seriesVersion,input.openingNumber,input.evidenceReference,ctx.actorId,ctx.now,ctx.requestId,input.reason),
  db.prepare('INSERT INTO managed_live_invoice_series(financial_scope_id,next_number,revision) VALUES(?,?,0)').bind(id,input.openingNumber),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed.live.financial_scope.recorded','managed_live_financial_scope',?,?,?,?,?)").bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,'recorded','company.live_financial_scope',id),ctx.actorId,id,input.reason,JSON.stringify({issuerScopeDigest,companyScopeDigest:input.companyScopeDigest,issuerModel:input.issuerModel}),ctx.requestId,ctx.now),...await financialNoticeStatements(db,ctx,{kind:'company.live_financial_scope',sourceId:id,status:'recorded'}),receipt.insert(result)]);return result;
 }catch(error){const recovered=await commandReceipt(db,ctx,{action:'managed.live.financial_scope.recorded',subjectType:'managed_live_financial_scope',subjectId:input.companyEntityReference},input);if(recovered.replayed)return recovered.result as typeof result;throw error;}
}
export async function readManagedLiveFinancialReadiness(db:D1Database,input:{sellerId:string;companyEntityReference:string;companyScopeDigest:string;financialScopeId?:string},now:number){
 const scope=await db.prepare(`SELECT ${scopeColumns} FROM managed_live_financial_scopes f JOIN managed_live_invoice_series n ON n.financial_scope_id=f.id JOIN users u ON u.id=f.reviewed_by JOIN user_roles r ON r.user_id=u.id WHERE f.company_entity_reference=? AND f.company_scope_digest=? AND f.issuer_model=? AND u.status='active' AND r.role='super_admin' AND f.reviewed_at<=? AND (? IS NULL OR f.id=?) ORDER BY f.reviewed_at DESC,f.id DESC LIMIT 1`).bind(input.companyEntityReference,input.companyScopeDigest,LIVE_MANAGED_INVOICE_MODEL,now,input.financialScopeId??null,input.financialScopeId??null).first<Scope>();
 const blockers=scope?[]:[{id:'actual_invoice_scope',detail:'Record independent clearance of the actual company commercial invoice model and actual numbering series.',nextActor:'super_admin',href:'/admin/programs'}];
 const guards=scope?paymentGuard(db,`EXISTS(SELECT 1 FROM managed_live_financial_scopes f JOIN managed_live_invoice_series n ON n.financial_scope_id=f.id JOIN users u ON u.id=f.reviewed_by JOIN user_roles r ON r.user_id=u.id WHERE f.id=? AND f.company_entity_reference=? AND f.company_scope_digest=? AND f.issuer_scope_digest=? AND u.status='active' AND r.role='super_admin')`,[scope.id,input.companyEntityReference,input.companyScopeDigest,scope.issuerScopeDigest]):[];
 return {ready:Boolean(scope),blockers,financialScopeId:scope?.id??null,issuerModel:scope?.issuerModel??null,issuerScopeDigest:scope?.issuerScopeDigest??null,scope,guards};
}

export type LiveManagedInvoiceGroupInput={financialScopeId:string;issuerReference:string;snapshot:Record<string,unknown>};
/** Appended after exact original live snapshot inserts in the order's guarded transaction. */
export async function prepareLiveManagedInvoiceStatements(db:D1Database,input:{orderId:string;requestId:string;now:number;groups:LiveManagedInvoiceGroupInput[];pricedOrderItemIds?:ReadonlySet<string>}){
 const statements:D1PreparedStatement[]=[];
 for(const group of input.groups){
  const scope=await db.prepare(`SELECT ${scopeColumns} FROM managed_live_financial_scopes f WHERE f.id=? AND f.company_entity_reference=?`).bind(group.financialScopeId,group.issuerReference).first<Scope>();
  if(!scope)throw new ManagedLiveFinancialError('The actual original company invoice issuer needs review.');
  const money=Object.fromEntries(['goodsPaisa','deliveryPaisa','serviceFeePaisa','promotionPaisa','walletPaisa','totalPaisa'].map(key=>{const value=group.snapshot[key];if(!Number.isSafeInteger(value)||Number(value)<0)throw new ManagedLiveFinancialError('Preserve the exact original receipt group amounts.');return [key,Number(value)];}));
  const lines=group.snapshot.items as {orderItemId:string;lineTotalPaisa:number;unitPricePaisa:number;quantity:number;billingPromotionPaisa?:number;billingWalletPaisa?:number}[];
  if(!Array.isArray(lines)||!lines.length||new Set(lines.map(i=>i.orderItemId)).size!==lines.length||lines.some(i=>typeof i.orderItemId!=='string'||!Number.isSafeInteger(i.lineTotalPaisa)||i.lineTotalPaisa<0)||lines.reduce((n,i)=>n+i.lineTotalPaisa,0)!==money.goodsPaisa||lines.reduce((n,i)=>n+(i.billingPromotionPaisa??0),0)!==money.promotionPaisa||lines.reduce((n,i)=>n+(i.billingWalletPaisa??0),0)!==money.walletPaisa)throw new ManagedLiveFinancialError('Preserve every original invoice line and its captured promotion/wallet allocation.');
  const commercialValuePaisa=money.goodsPaisa+money.deliveryPaisa+money.serviceFeePaisa-money.promotionPaisa;
  if(!Number.isSafeInteger(commercialValuePaisa)||commercialValuePaisa-money.walletPaisa!==money.totalPaisa)throw new ManagedLiveFinancialError('The original commercial invoice total needs reconciliation.');
  const id=crypto.randomUUID(),numberId=crypto.randomUUID(),requestId='live-invoice:'+await digestFormRequest({requestId:input.requestId,issuer:group.issuerReference});
  const clearedIssuer=JSON.parse(scope.issuerSnapshotJson) as ManagedLiveIssuer;
  const snapshot=JSON.stringify({...group.snapshot,commercialValuePaisa,financialScopeId:scope.id,issuerModel:scope.issuerModel,issuerScopeDigest:scope.issuerScopeDigest,issuer:{...clearedIssuer,reference:scope.companyEntityReference,kind:'company',pan:clearedIssuer.taxRegistrationNumber},taxDocument:false,recordKind:'live',orderId:input.orderId});
  if('simulationLabel' in group.snapshot)throw new ManagedLiveFinancialError('The actual invoice must originate from the live order group.');
  statements.push(...paymentGuard(db,`(SELECT COUNT(*) FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE i.order_id=? AND s.record_kind='live' AND s.live_financial_scope_id=? AND s.invoice_issuer_reference=?)=?`,[input.orderId,scope.id,group.issuerReference,lines.length]),
   ...lines.flatMap(line => {
    const bindings = [line.orderItemId, input.orderId, line.lineTotalPaisa, line.unitPricePaisa, line.quantity, scope.id, group.issuerReference];
    if (!input.pricedOrderItemIds?.has(line.orderItemId)) {
     return paymentGuard(db, `EXISTS(SELECT 1 FROM managed_commercial_snapshots s JOIN order_items i ON i.id=s.order_item_id WHERE i.id=? AND i.order_id=? AND i.line_total_paisa=? AND i.unit_price_paisa=? AND i.quantity=? AND s.record_kind='live' AND s.live_financial_scope_id=? AND s.invoice_issuer_reference=?)`, bindings);
    }
    return paymentGuard(db, `EXISTS(
      SELECT 1 FROM managed_commercial_snapshots s
      JOIN order_items i ON i.id=s.order_item_id
      JOIN order_item_pricing_snapshots p ON p.order_item_id=i.id AND p.order_id=i.order_id
      WHERE i.id=? AND i.order_id=?
        AND json_extract(p.snapshot_json,'$.customerSubtotalPaisa')=?
        AND json_extract(p.snapshot_json,'$.customerUnitPaisa')=?
        AND i.quantity=? AND json_extract(p.snapshot_json,'$.quantity')=i.quantity
        AND s.record_kind='live' AND s.live_financial_scope_id=? AND s.invoice_issuer_reference=?
    )`, bindings);
   }),
   ...paymentGuard(db,'EXISTS(SELECT 1 FROM orders WHERE id=? AND delivery_charge_paisa=? AND buyer_platform_fee_paisa=?)',[input.orderId,money.deliveryPaisa,money.serviceFeePaisa]),
   db.prepare(`UPDATE managed_live_invoice_series SET next_number=next_number+1,revision=revision+1 WHERE financial_scope_id=?`).bind(scope.id),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO managed_invoice_groups(id,order_id,issuer_reference,invoice_number,snapshot_json,barcode_payload,qr_payload,simulation_label,status,request_id,issued_at,record_kind) SELECT ?,?,?,?||'-'||CAST(next_number-1 AS TEXT),?,?||'-'||CAST(next_number-1 AS TEXT),'hastabazaar:commercial-invoice:'||?,NULL,'issued',?,?,'live' FROM managed_live_invoice_series WHERE financial_scope_id=?`).bind(id,input.orderId,group.issuerReference,scope.seriesPrefix,snapshot,scope.seriesPrefix,id,requestId,input.now,scope.id),
   db.prepare(`INSERT INTO managed_live_invoice_numbers(id,financial_scope_id,invoice_group_id,sequence,invoice_number,request_id,created_at) SELECT ?,?,g.id,n.next_number-1,g.invoice_number,?,? FROM managed_invoice_groups g JOIN managed_live_invoice_series n ON n.financial_scope_id=? WHERE g.id=?`).bind(numberId,scope.id,requestId,input.now,scope.id,id));
 }
 return statements;
}
export async function readOwnedLiveManagedInvoices(db:D1Database,input:{orderId:string;customerId:string}){
 const rows=await db.prepare(`SELECT g.id,g.invoice_number AS invoiceNumber,g.snapshot_json AS snapshotJson,g.status,g.issued_at AS issuedAt FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id WHERE o.id=? AND o.customer_id=? AND g.record_kind='live' ORDER BY g.invoice_number`).bind(input.orderId,input.customerId).all<{id:string;invoiceNumber:string;snapshotJson:string;status:string;issuedAt:number}>();
 return Promise.all(rows.results.map(async row=>({...row,snapshot:JSON.parse(row.snapshotJson),adjustments:(await db.prepare("SELECT id,adjustment_number AS adjustmentNumber,kind,amount_paisa AS amountPaisa,snapshot_json AS snapshotJson,issued_at AS issuedAt FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' ORDER BY issued_at,id").bind(row.id).all()).results})));
}

/** Explicit original-document credit. Does not execute/refund money or recalculate maker economics. */
export async function issueLiveManagedInvoiceAdjustment(db:D1Database,ctx:CommandContext,input:{invoiceGroupId:string;sourceKind:'refund'|'cancellation';sourceId:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'refund.approve.standard',ManagedLiveFinancialError,'super_admin');
 const receipt=await commandReceipt(db,ctx,{action:'managed.live.invoice.adjustment',subjectType:'managed_invoice_group',subjectId:input.invoiceGroupId},input);
 const invoice=await db.prepare("SELECT g.id,g.order_id AS orderId,g.invoice_number AS invoiceNumber,g.snapshot_json AS snapshotJson,o.customer_id AS customerId FROM managed_invoice_groups g JOIN orders o ON o.id=g.order_id WHERE g.id=? AND g.record_kind='live'").bind(input.invoiceGroupId).first<{id:string;orderId:string;invoiceNumber:string;snapshotJson:string;customerId:string}>();
 if(!invoice||invoice.customerId===ctx.actorId)throw new ManagedLiveFinancialError('An independent operator must open the exact original actual invoice.');
 const originalScope=(JSON.parse(invoice.snapshotJson) as {financialScopeId:string}).financialScopeId;
 const independence=`NOT EXISTS(SELECT 1 FROM managed_invoice_groups original_invoice WHERE original_invoice.id=? AND ${liveInvoicePartySql('original_invoice','?','?')})`,independentValues=[invoice.id,originalScope,...Array.from({length:4},()=>ctx.actorId)];
 if(!await db.prepare('SELECT 1 WHERE '+independence).bind(...independentValues).first())throw new ManagedLiveFinancialError('An eligible operator without a current or retained invoice seller interest is required.',403);
 if(receipt.replayed)return receipt.result as {id:string;invoiceGroupId:string};
 if(ctx.expectedRevision!==null)throw new ManagedLiveFinancialError('Use a fresh original invoice adjustment request.');
 text(input.reason,'original invoice adjustment reason',10,1000);
 const original=JSON.parse(invoice.snapshotJson) as {financialScopeId:string;goodsPaisa:number;deliveryPaisa:number;serviceFeePaisa:number;promotionPaisa:number;items:{orderItemId:string}[]};
 const fullValue=original.goodsPaisa+original.deliveryPaisa+original.serviceFeePaisa-original.promotionPaisa;
 const previous=await db.prepare("SELECT COALESCE(SUM(amount_paisa),0) AS amount FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' AND kind='credit_note'").bind(invoice.id).first<{amount:number}>();
 let amountPaisa:number,sourcePredicate:string,sourceBindings:(string|number)[];
 if(input.sourceKind==='refund'){
  const refund=await db.prepare("SELECT r.amount_paisa AS amount,c.order_item_id AS itemId FROM refunds r JOIN return_requests c ON c.id=r.return_request_id WHERE r.id=? AND r.order_id=? AND r.status='paid'").bind(input.sourceId,invoice.orderId).first<{amount:number;itemId:string}>();
  if(!refund||!original.items.some(i=>i.orderItemId===refund.itemId))throw new ManagedLiveFinancialError('A completed refund of an exact original invoice item is required.');
  amountPaisa=refund.amount;sourcePredicate="EXISTS(SELECT 1 FROM refunds r JOIN return_requests c ON c.id=r.return_request_id WHERE r.id=? AND r.order_id=? AND r.status='paid' AND r.amount_paisa=? AND c.order_item_id=?)";sourceBindings=[input.sourceId,invoice.orderId,amountPaisa,refund.itemId];
 }else if(input.sourceKind==='cancellation'){
  if(input.sourceId!==invoice.orderId||!await db.prepare("SELECT 1 FROM orders WHERE id=? AND status='cancelled'").bind(invoice.orderId).first())throw new ManagedLiveFinancialError('The original order must actually be cancelled before its remaining invoice credit.');
  amountPaisa=fullValue-Number(previous?.amount??0);sourcePredicate="EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')";sourceBindings=[invoice.orderId];
 }else throw new ManagedLiveFinancialError('Choose an actual original refund or cancellation source.');
 if(!Number.isSafeInteger(fullValue)||!Number.isSafeInteger(amountPaisa)||amountPaisa<=0||amountPaisa+Number(previous?.amount??0)>fullValue)throw new ManagedLiveFinancialError('The original commercial value or completed refund credit needs reconciliation.');
 const id=crypto.randomUUID(),result={id,invoiceGroupId:invoice.id};
 const snapshot=JSON.stringify({originalInvoiceId:invoice.id,originalInvoiceNumber:invoice.invoiceNumber,sourceKind:input.sourceKind,sourceId:input.sourceId,amountPaisa,issuerModel:LIVE_MANAGED_INVOICE_MODEL,taxDocument:false,recordKind:'live'});
 await db.batch([...authority.statements,...paymentGuard(db,independence,independentValues),...paymentGuard(db,sourcePredicate,sourceBindings),
  ...paymentGuard(db,"EXISTS(SELECT 1 FROM managed_invoice_groups WHERE id=? AND snapshot_json=? AND record_kind='live') AND COALESCE((SELECT SUM(amount_paisa) FROM managed_invoice_adjustments WHERE invoice_group_id=? AND record_kind='live' AND kind='credit_note'),0)=?",[invoice.id,invoice.snapshotJson,invoice.id,Number(previous?.amount??0)]),
  db.prepare('UPDATE managed_live_invoice_series SET next_number=next_number+1,revision=revision+1 WHERE financial_scope_id=?').bind(original.financialScopeId),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO managed_invoice_adjustments(id,invoice_group_id,adjustment_number,kind,amount_paisa,reason_code,note,snapshot_json,simulation_label,request_id,created_by,issued_at,record_kind) SELECT ?,?,f.series_prefix||'-'||CAST(n.next_number-1 AS TEXT),'credit_note',?,?,?,?,NULL,?,?,?,'live' FROM managed_live_invoice_series n JOIN managed_live_financial_scopes f ON f.id=n.financial_scope_id WHERE f.id=?`).bind(id,invoice.id,amountPaisa,input.sourceKind,input.reason,snapshot,ctx.requestId,ctx.actorId,ctx.now,original.financialScopeId),
  db.prepare('INSERT INTO managed_live_invoice_adjustment_sources(adjustment_id,invoice_group_id,source_kind,source_id) VALUES(?,?,?,?)').bind(id,invoice.id,input.sourceKind,input.sourceId),
  db.prepare(`INSERT INTO managed_live_invoice_numbers(id,financial_scope_id,adjustment_id,sequence,invoice_number,request_id,created_at) SELECT ?,?,a.id,n.next_number-1,a.adjustment_number,?,? FROM managed_invoice_adjustments a JOIN managed_live_invoice_series n ON n.financial_scope_id=? WHERE a.id=?`).bind(crypto.randomUUID(),original.financialScopeId,ctx.requestId,ctx.now,original.financialScopeId,id),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed.live.invoice.adjustment','managed_invoice_adjustment',?,?,?,?,?)").bind(crypto.randomUUID(),ctx.actorId,id,input.reason,snapshot,ctx.requestId,ctx.now),...await financialNoticeStatements(db,ctx,{kind:'finance.invoice_adjustment',sourceId:id,status:'issued',nativeEventId:id}),receipt.insert(result)]);
 return result;
}


