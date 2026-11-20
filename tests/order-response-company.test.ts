import assert from 'node:assert/strict';
import test from 'node:test';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveInventory,incentiveOrder,incentiveItem} from './helpers/incentive-db';
import {companyDetails} from '../lib/content/company-details';
import {prepareOrderResponseRelease} from '../lib/orders/response-workflow';
import {prepareInitialResponseNotices} from '../lib/orders/response-notifications';
import {confirmFirstCodReview,getFirstCodReview} from '../lib/orders/first-cod-review';
import {reportPreparationIssue} from '../lib/orders/response-cases';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
void test('company-operated preparation belongs to the actual company operator and does not blame the maker',async()=>{
 // Retained company responsibility is tested independently of unavailable live activation.
 const base=await incentiveReportDatabase(),f={...base,orderId:'retained-company-order',itemId:'retained-company-item',actorId:'customer'};try{
  f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('customer','maker@local.hastabazaar.test','Fictional historical maker','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional operator','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('customer','seller',1),('reviewer','super_admin',1)");
  await seedIncentiveInventory(f.db);await incentiveOrder(f.db,f.orderId).run();await incentiveItem(f.db,f.itemId,f.orderId).run();
  await f.db.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,product_value_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,simulation_label,created_at) VALUES('historical-company',?,'seller','managed_maker','managed_sale_linked_percentage_v1',?,?,'FICTIONAL-BENEFICIARY','historical-fixture','en',10000,10000,900,900,9100,'FICTIONAL-HISTORICAL-ORDER',1)`).bind(f.itemId,companyDetails.entityReference,companyDetails.entityReference).run();
  await f.db.batch([f.db.prepare("UPDATE orders SET status='confirmed' WHERE id=?").bind(f.orderId),...prepareOrderResponseRelease(f.db,f.orderId),...await prepareInitialResponseNotices(f.db,f.orderId)]);

  if((await getFirstCodReview(f.db,f.orderId))?.status==='pending')await confirmFirstCodReview(f.db,{orderId:f.orderId,actorId:'reviewer',reason:'Confirm the exact fictional first COD contact and order.',requestId:'response-company-cod',now:Date.now()});
  const portion=f.sqlite.prepare('SELECT id,operator_mode FROM order_response_portions WHERE order_id=?').get(f.orderId)!;assert.equal(portion.operator_mode,'company');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.order.response' AND audience_role='seller'").get()!.n,0);
  f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('response-staff','response-staff@local.hastabazaar.test','Fictional Operations','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('response-staff','admin',1)");
  const input={portionId:String(portion.id),itemIds:[f.itemId],kind:'delay' as const,detail:'The company preparation operator has identified an actual materials delay.',proposedReadyAt:null},ctx={actorId:f.actorId,requestId:'company-scope-issue',expectedRevision:null,now:Date.now()};
  await assert.rejects(reportPreparationIssue(f.db,ctx,input,'seller'));
  await assert.rejects(reportPreparationIssue(f.db,{...ctx,actorId:'response-staff'},input,'staff'));
  await reportPreparationIssue(f.db,{...ctx,actorId:'reviewer'},input,'staff');
  assert.equal((await readPreparationWorkspace(f.db,'response-staff',f.orderId,'staff'))!.portions.length,0);
  assert.equal((await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff'))!.portions[0].cases.length,1);
 }finally{f.dispose();}
});
