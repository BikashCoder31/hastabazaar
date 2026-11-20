import { calculateMarketplaceFee, type FeeBreakdown, type FeeWaiverCampaign, type FeeWaiverContext, type FeeWaiverCommand, type FeeWaiverTerms } from '../../lib/marketplace/fee-waivers';

/** Exact historical rows in owned disposable fixtures only. No production import or command engine. */
export async function seedLegacyRevision(db:D1Database, campaign:FeeWaiverCampaign, now=100, requestId=`history-${campaign.id}-${campaign.revision}`) {
  await db.prepare('INSERT OR IGNORE INTO marketplace_fee_waiver_campaigns(id,revision,created_at,updated_at) VALUES(?,?,?,?)').bind(campaign.id,campaign.revision,now,now).run();
  await db.prepare('INSERT INTO marketplace_fee_waiver_revisions(campaign_id,revision,state,name,description,starts_at,ends_at,created_by,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(campaign.id,campaign.revision,campaign.state,campaign.name,campaign.description,campaign.startsAt,campaign.endsAt,'owner',requestId,now).run();
  await db.prepare('UPDATE marketplace_fee_waiver_campaigns SET revision=?,updated_at=? WHERE id=?').bind(campaign.revision,now,campaign.id).run();
  await db.prepare("UPDATE marketplace_fee_waiver_control SET revision=revision+1 WHERE id='default'").run();
  return campaign;
}
export async function seedLegacyPublishedCampaign(db:D1Database,id:string,terms:FeeWaiverTerms,now=100) {
  await seedLegacyRevision(db,{...terms,id,revision:1,state:'draft'},now);
  return seedLegacyRevision(db,{...terms,id,revision:2,state:'published'},now);
}
export async function seedLegacyReceipt(db:D1Database,context:FeeWaiverContext,command:FeeWaiverCommand,response:FeeWaiverCampaign) {
  const payload=JSON.stringify({expectedRevision:context.expectedRevision,command});
  await db.prepare('INSERT INTO marketplace_fee_waiver_requests(request_id,actor_id,auth_subject,command_json,response_json,created_at) VALUES(?,?,?,?,?,?)').bind(context.requestId,context.actorId,context.authSubject,payload,JSON.stringify(response),context.now).run();
  await db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES(?,?,'marketplace.fee-waiver.create','marketplace_fee_waiver',?,'Historical fixture',NULL,?,?,NULL,?)").bind(crypto.randomUUID(),context.actorId,response.id,JSON.stringify(response),'fee-waiver:'+context.requestId,context.now).run();
}
export function legacyFeeEvidenceInsert(db:D1Database,itemId:string,fee:FeeBreakdown,now:number) {
  return db.prepare('INSERT INTO order_item_marketplace_fees(order_item_id,standard_bps,base_paisa,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(itemId,fee.standardBps,fee.basePaisa,fee.standardPaisa,fee.waivedPaisa,fee.netPaisa,fee.campaignId,fee.campaignRevision,now);
}
/** Materialize the original legacy financial fact before exercising historical readers/refunds. */
export async function seedLegacyOrderFees(db:D1Database,orderId:string,campaign:FeeWaiverCampaign|null,now=100) {
  const rows=await db.prepare('SELECT id,commission_bps AS basisPoints,COALESCE(commission_base_paisa,line_total_paisa-seller_discount_paisa) AS basePaisa FROM order_items WHERE order_id=?').bind(orderId).all<{id:string;basisPoints:number;basePaisa:number}>();
  for(const row of rows.results) {
    const fee=calculateMarketplaceFee(row.basePaisa,row.basisPoints,campaign);
    await db.prepare('UPDATE order_items SET commission_bps=?,commission_paisa=? WHERE id=?').bind(campaign?0:fee.standardBps,fee.netPaisa,row.id).run();
    await legacyFeeEvidenceInsert(db,row.id,fee,now).run();
  }
}
