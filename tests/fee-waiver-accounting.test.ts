import {seedLegacyPublishedCampaign,seedLegacyOrderFees} from './helpers/legacy-fee-history-fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fees from '../lib/marketplace/fee-waivers';
import * as repository from '../lib/db/repositories/fee-waivers';
import { readOrderCustomerServiceFees } from '../lib/db/repositories/customer-service-fees';
import { createCodOrder } from '../lib/db/repositories/orders';
import { cancelCustomerOrder } from '../lib/db/repositories/fulfillment';
import {
  buildEarningsAccrualStatements,
  getSellerFinanceSummary,
  prepareSellerPayout,
  operatePayout,
} from '../lib/db/repositories/payouts';
import {
  createCustomerReturnRequest,
  reviewReturnAsAdmin,
  advanceReturnAsAdmin,
} from '../lib/db/repositories/returns';
import { getCommissionReport } from '../lib/db/repositories/commission-reporting';
import { getSellerEarnings } from '../lib/seller/earnings';
import { promoCostPreview } from '../lib/incentives/presentation';
import { readAccountingSources } from '../lib/accounting/source-queries';
import { parseAccountingQuery } from '../lib/accounting/filters';
import {
  feeWaiverCheckoutFixture,
  feeWaiverTerms,
} from './helpers/fee-waiver-fixture';
import { accountingFixture } from './helpers/accounting-fixture';
import { executeFixtureRefund } from './helpers/execute-fixture-refund';
import { confirmFixtureRemittance } from './helpers/verified-cod-remittance';
import { prepareSellerParcels, listParcels, operateParcel } from '../lib/operations/parcels';
import { confirmFirstCodReview, getFirstCodReview } from '../lib/orders/first-cod-review';
import { sellerBankState, submitSellerBankDetails, reviewSellerBankDetails } from '../lib/sellers/bank-details';
import { saveCompanyAccountDraft, submitCompanyAccountForReview, verifyCompanyAccount } from '../lib/payments/company-accounts';
import { recordRefundFundingStatement } from '../lib/payments/refund-funding';
import { preparePayoutTransfer, approvePayoutTransfer, startPayoutTransfer, recordPayoutTransferOutcome } from '../lib/payments/payout-transfers';
import { companyDetails } from '../lib/content/company-details';
import { getReturnHandling, recordReturnHandling } from '../lib/returns/handling';

async function checkout(waived: boolean, quantity = 1, price = 10000) {
  const f = await feeWaiverCheckoutFixture();
  // This accounting scenario starts without a bank instruction. The generic
  // historical fixture's BANK-a label is not a verified destination/version.
  f.sqlite.prepare("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='seller-a'").run();
  f.sqlite
    .prepare('UPDATE products SET price_paisa=?,return_eligible=1')
    .run(price);
  f.sqlite.prepare('UPDATE cart_items SET quantity=?').run(quantity);
  // Mature fictional seller: isolate the net entitlement from unrelated reserve policy.
  f.sqlite.exec('UPDATE seller_profiles SET approved_at=0');
  const historicalCampaign=waived ? await seedLegacyPublishedCampaign(f.database,'accounting-history',feeWaiverTerms) : null;
  await createCodOrder(
    f.database,
    'token',
    'receipt',
    f.input,
    100,
    'checkout-buyer',
  );
  const order = f.sqlite.prepare('SELECT id,order_number FROM orders').get()!;
  await seedLegacyOrderFees(f.database,String(order.id),historicalCampaign);
  const item = f.sqlite.prepare('SELECT id FROM order_items').get()!;
  return {
    ...f,
    orderId: String(order.id),
    orderNumber: String(order.order_number),
    itemId: String(item.id),
    originalDelivery: f.sqlite.prepare('SELECT * FROM order_delivery_allocations').all(),
    originalCustomerFee: f.sqlite.prepare('SELECT * FROM order_customer_service_fees').all(),
  };
}
type Fixture = Awaited<ReturnType<typeof checkout>>;
async function payoutSources(f:Fixture){
  const db=f.database,ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'owner',requestId,expectedRevision,now:Date.now()});
  const state=await sellerBankState(db,'seller-a');
  await submitSellerBankDetails(db,{sellerId:'seller-a',actorId:'user-a',revision:state.revision,now:Date.now(),details:{payoutBeneficiary:'Maker',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'TEST-LEGACY-FEE'},document:{id:'fee-bank',kind:'bank_verification',objectKey:'private/seller-documents/seller-a/fee-bank',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20}});
  await reviewSellerBankDetails(db,{sellerId:'seller-a',actorId:'owner',revision:(await sellerBankState(db,'seller-a')).revision,reference:'FICTIONAL-FEE-BENEFICIARY',reason:'Independently verify the original fictional owner and exact bank destination.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'fee-bank-review',now:Date.now()});
  const draft=await saveCompanyAccountDraft(db,ctx('fee-company'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Company Bank',branch:'Fictional Branch',accountNumber:'TEST-FEE-CAPITAL',currency:'NPR',purpose:'payment_source'},evidenceReference:'FICTIONAL-INDEPENDENT-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Retain fictional company capital ownership separately from customer or seller balances.'});
  await submitCompanyAccountForReview(db,ctx('fee-company-submit','0'),{versionId:draft.versionId,reason:'Submit original fictional company ownership for review.'});
  await verifyCompanyAccount(db,ctx('fee-company-verify','1'),{versionId:draft.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-COMPANY-OWNERSHIP-VERIFIED',reason:'Verify this exact fictional company capital account and currency.'});
  await recordRefundFundingStatement(db,ctx('fee-capital'),{accountVersionId:draft.versionId,statementIdentity:'FICTIONAL-FEE-CAPITAL',asOf:Date.now(),cashPaisa:1000000,restrictedPaisa:0,evidenceReference:'FICTIONAL-INDEPENDENT-CAPITAL-STATEMENT',restrictionsReference:'FICTIONAL-OTHER-PEOPLES-MONEY-EXCLUDED',availableFundsConfirmed:true,reason:'Verify independent fictional company capital, not an inferred seller balance.'});
  return {ctx,accountVersionId:draft.versionId};
}
async function deliver(f: Fixture) {
  if (await getFirstCodReview(f.database, f.orderId)) await confirmFirstCodReview(f.database, {
    orderId:f.orderId,actorId:'owner',reason:'Confirm original fictional fee accounting COD order.',requestId:'fee-first-cod',now:190,
  });
  await prepareSellerParcels(f.database,{orderId:f.orderId,actorId:'owner',requestId:'fee-parcel',now:191});
  f.sqlite.prepare("UPDATE order_items SET fulfillment_status='ready_for_pickup' WHERE order_id=?").run(f.orderId);
  const due=Number(f.sqlite.prepare('SELECT grand_total_paisa FROM orders WHERE id=?').get(f.orderId)!.grand_total_paisa);
  for(const action of ['assign','dispatch','deliver','collect','propose_remittance']){
    const parcel=(await listParcels(f.database,f.orderId))[0];
    await operateParcel(f.database,{jobId:parcel.id,actorId:'owner',action,version:parcel.version,requestId:'fee-'+action,
      note:'Record original fictional delivery and independently reconciled cash.',now:200,
      ...(action==='assign'?{method:'courier',courierName:'Fictional Carrier',trackingCode:'FICTIONAL-FEE-PARCEL'}:{}),
      ...(['collect','propose_remittance'].includes(action)?{amountPaisa:due,reference:'FICTIONAL-FEE-'+action}:{})});
    if(action==='collect')assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n,0);
    if(action==='propose_remittance')await confirmFixtureRemittance(f.database,{jobId:parcel.id,actorId:'owner',requestId:'fee-reconcile',amountPaisa:due,reference:'FICTIONAL-FEE-propose_remittance'});
  }
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n,1);
}
async function refund(f: Fixture, index: number, amount: number) {
  const request = await createCustomerReturnRequest(f.database, {
    orderNumber: f.orderNumber,
    receiptTokenHash: 'receipt',
    customerId: 'checkout-buyer',
    orderItemId: f.itemId,
    quantity: 1,
    reason: 'defective',
    requestedResolution: 'refund',
    detail: 'Fictional product has a documented defect.',
    locale: 'en-NP',
    idempotencyKey: `return-${index}`,
    evidence: [],
    now: 210 + index,
  });
  await reviewReturnAsAdmin(f.database, {
    returnRequestId: request.id,
    actorId: 'owner',
    actorRole: 'super_admin',
    action: 'approve',
    note: 'Fictional refund approved',
    publicMessageEn: 'Refund approved.',
    publicMessageNe: 'Refund approved.',
    responsibility: 'seller',
    outcome: 'refund',
    itemRefundPaisa: amount,
    deliveryRefundPaisa: 5000,
    requestId: `approve-${index}`,
    now: 220 + index,
  });
  const options = {
    returnRequestId: request.id,
    actorId: 'owner',
    actorRole: 'super_admin' as const,
    note: 'Fictional refund processing',
    publicMessageEn: 'Refund update.',
    publicMessageNe: 'Refund update.',
  };
  await assert.rejects(advanceReturnAsAdmin(f.database, {
    ...options,
    action: 'start_refund',
    requestId: `start-${index}`,
    now: 230 + index,
  }), /Use the verified refund funding packet/);
  const complete = {
    ...options,
    action: 'complete_refund' as const,
    reference: `refund-ref-${index}`,
    requestId: `complete-${index}`,
    now: 240 + index,
  };
  await assert.rejects(advanceReturnAsAdmin(f.database, complete), /Use the verified refund funding packet/);
  const source=f.sqlite.prepare('SELECT id,amount_paisa,delivery_amount_paisa FROM refunds WHERE return_request_id=?').get(request.id)!;
  assert.equal(source.delivery_amount_paisa,5000);
  assert.equal(source.amount_paisa,amount+5000);
  const packet=await executeFixtureRefund(f.database,{actorId:'owner',kind:'return_refund',sourceId:String(source.id),customerId:'checkout-buyer',deferCompletion:true});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE refund_id=?").get(source.id)!.n,0);
  const paid=await packet.complete();
  const bank=f.sqlite.prepare("SELECT * FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id=?").get(packet.packetId)!;
  assert.equal(bank.amount_paisa,amount+5000);
  assert.deepEqual(await packet.complete(),paid);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM company_outgoing_bank_identities WHERE packet_kind='refund' AND packet_id=?").all(packet.packetId),[bank]);
  // Payment alone does not close physical care or permit another unit's claim.
  const handling=(await getReturnHandling(f.database,request.id))!;
  await recordReturnHandling(f.database,{actorId:'owner',requestId:`physical-waiver-${index}`,expectedRevision:String(handling.revision),now:Date.now()},
    {caseId:request.id,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived after review of this damaged unit.',privateNote:'Independent fictional defect evidence confirms this unit is unusable and its collection is uneconomic; approve this specific no-return disposition.',evidenceReference:`FICTIONAL-UNIT-${index}-PHYSICAL-REVIEW`});
  await advanceReturnAsAdmin(f.database,{...options,action:'close_paid_refund',requestId:`close-${index}`,now:Date.now()});
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_delivery_allocations').all(),f.originalDelivery);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_customer_service_fees').all(),f.originalCustomerFee);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='sale'").get()!.n,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='refund' AND refund_id=?").get(source.id)!.n,1);
}
void test('historical breakdown preserves recorded amounts even when rate multiplication would round differently', () => {
  assert.equal(typeof fees.historicalFeeBreakdown, 'function');
  assert.deepEqual(fees.historicalFeeBreakdown(900, 8, 101), {
    standardBps: 900,
    basePaisa: 101,
    standardPaisa: 8,
    waivedPaisa: 0,
    netPaisa: 8,
    campaignId: null,
    campaignRevision: null,
  });
});

for (const waived of [false, true])
  void test(`${waived ? 'waived' : 'ordinary'} delivery and payout retain net semantics and immutable fee evidence`, async (t) => {
    let clock=100;
    t.mock.method(Date, 'now', () => clock);
    const f = await checkout(waived);
    try {
      clock=200;
      await deliver(f);
      await f.database.batch(
        buildEarningsAccrualStatements(f.database, {
          orderId: f.orderId,
          now: 201,
        }),
      );
      const breakdown = (
        await repository.readOrderMarketplaceFees(f.database, [f.itemId])
      ).get(f.itemId)!;
      assert.equal(breakdown.standardPaisa, 1000);
      assert.equal(breakdown.waivedPaisa, waived ? 1000 : 0);
      assert.equal(breakdown.netPaisa, waived ? 0 : 1000);
      const buyerFee=(await readOrderCustomerServiceFees(f.database,[f.orderId])).get(f.orderId)!;
      assert.equal(buyerFee.waivedPaisa,0,'old seller relief never becomes customer campaign relief');
      assert.equal(buyerFee.campaign,null);
      const now = 100 * 86400000;
      clock=now;
      const summary = await getSellerFinanceSummary(
        f.database,
        'seller-a',
        now,
      );
      assert.equal(summary.availablePaisa, waived ? 10000 : 9000);
      assert.equal(summary.commissionPaisa, waived ? 0 : -1000);
      const earnings = await getSellerEarnings(f.database, 'seller-a', now);
      assert.deepEqual(earnings.marketplaceFees, {
        originalStandardPaisa: 1000,
        originalWaivedPaisa: waived ? 1000 : 0,
        originalNetPaisa: waived ? 0 : 1000,
      });
      const sources=await payoutSources(f);
      const payout = await prepareSellerPayout(f.database, {
        sellerId: 'seller-a',
        actorId: 'owner',
        actorRole: 'super_admin',
        note: 'Fictional net seller payout',
        requestId: 'prepare',
        now,
      });
      for (const action of ['start_processing', 'mark_paid'] as const)
        await assert.rejects(operatePayout(f.database, {
          payoutId: payout.id,
          actorId: 'owner',
          actorRole: 'super_admin',
          action,
          note: 'Fictional payout evidence',
          providerReference: 'SIM-PAYOUT',
          requestId: action,
          now: now + 1,
        }), /verified.*(?:payment|payout)|outgoing.*packet/i);
      const packet=await preparePayoutTransfer(f.database,sources.ctx('fee-payout-packet'),{model:'registered',payoutId:payout.id,accountVersionId:sources.accountVersionId,reason:'Bind only the original eligible net earnings to verified bank evidence.'});
      await approvePayoutTransfer(f.database,sources.ctx('fee-payout-approve','0'),{packetId:packet.id,reason:'Approve exact original net seller earnings and verified company funds.'});
      await startPayoutTransfer(f.database,sources.ctx('fee-payout-start','1'),{packetId:packet.id,reason:'Record the original fictional manual instruction without assuming completion.'});
      assert.equal((await getSellerFinanceSummary(f.database,'seller-a',now)).paidPaisa,0);
      const outcome={packetId:packet.id,outcome:'paid' as const,amountPaisa:waived?10000:9000,bankAt:now,transactionIdentity:'FICTIONAL-FEE-NET-PAYOUT',evidenceReference:'FICTIONAL-INDEPENDENT-COMPLETED-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Verify the original actual fictional net bank debit and beneficiary.'};
      const paid=await recordPayoutTransferOutcome(f.database,sources.ctx('fee-payout-paid','2'),outcome);
      assert.deepEqual(await recordPayoutTransferOutcome(f.database,sources.ctx('fee-payout-paid','2'),outcome),paid);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_id=?").get(packet.id)!.n,1);
      assert.equal(
        (await getSellerFinanceSummary(f.database, 'seller-a', now + 2))
          .paidPaisa,
        waived ? 10000 : 9000,
      );
      const report = await getCommissionReport(f.database, {});
      assert.equal(report.totals.originalStandardPaisa, 1000);
      assert.equal(report.totals.originalWaivedPaisa, waived ? 1000 : 0);
      assert.equal(report.totals.netPaisa, waived ? 0 : 1000);
      assert.equal(
        report.rows[0].originalCommissionPaisa,
        1000 - report.totals.originalWaivedPaisa,
      );
      assert.equal(
        report.rows[0].minRateBps,
        1000,
        'the report rate is the recorded standard, even when net is zero',
      );
      assert.equal(report.rows[0].maxRateBps, 1000);
      assert.equal(report.totals.missingEntries, 0);
      const accounting = await readAccountingSources(
        f.database,
        parseAccountingQuery(
          new URLSearchParams('period=all&section=sellers'),
          now,
        ),
        now,
        'local_staging',
      );
      assert.equal(
        accounting.metrics.find(
          (m) => m.key === 'seller_original_standard_commission',
        )?.amountPaisa,
        '1000',
      );
      assert.equal(
        accounting.metrics.find(
          (m) => m.key === 'seller_original_waived_commission',
        )?.amountPaisa,
        waived ? '1000' : '0',
      );
      assert.equal(
        accounting.metrics.find((m) => m.key === 'seller_commission_earned')
          ?.amountPaisa,
        waived ? '0' : '1000',
      );
    } finally {
      await f.dispose();
    }
  });

void test('zero expected fees without a commission entry are not missing ledger money; historical reports retain recorded values', async () => {
  const f = await accountingFixture();
  try {
    f.insert('orders', {
      id: 'o',
      order_number: 'O',
      created_at: 100,
      status: 'delivered',
      payment_status: 'paid',
    });
    for (const [id, bps, commission] of [
      ['waived', 0, 0],
      ['historical', 900, 8],
    ] as const)
      f.insert('order_items', {
        id,
        order_id: 'o',
        seller_id: 'seller',
        seller_name_snapshot: 'Shop',
        line_total_paisa: 101,
        seller_discount_paisa: 0,
        commission_base_paisa: 101,
        commission_bps: bps,
        commission_paisa: commission,
        fulfillment_status: 'delivered',
      });
    f.insert('order_item_marketplace_fees', {
      order_item_id: 'waived',
      standard_bps: 900,
      base_paisa: 101,
      standard_paisa: 9,
      waived_paisa: 9,
      net_paisa: 0,
      campaign_id: 'campaign',
      campaign_revision: 2,
      created_at: 100,
    });
    const breakdown = await repository.readOrderMarketplaceFees(f.db, [
      'waived',
      'historical',
      'absent',
    ]);
    assert.equal(breakdown.get('historical')?.standardPaisa, 8);
    assert.equal(breakdown.get('historical')?.waivedPaisa, 0);
    assert.equal(breakdown.has('absent'), false);
    assert.equal((await repository.readOrderMarketplaceFees(f.db, [])).size, 0);
    const report = await getCommissionReport(f.db, {});
    assert.equal(
      report.totals.missingEntries,
      1,
      'only the historical nonzero fee is missing',
    );
    assert.equal(report.totals.originalStandardPaisa, 17);
    assert.equal(report.totals.originalWaivedPaisa, 9);
    assert.equal(report.totals.pendingPaisa, 8);
  } finally {
    f.dispose();
  }
});

void test('cancellation before delivery keeps the original waiver and never accrues fees or seller money', async (t) => {
  t.mock.method(Date, 'now', () => 100);
  const f = await checkout(true);
  try {
    await cancelCustomerOrder(f.database, {
      orderNumber: f.orderNumber,
      receiptTokenHash: 'receipt',
      customerId: 'checkout-buyer',
      note: 'Fictional cancellation before delivery',
      requestId: 'cancel',
      now: 110,
    });
    await f.database.batch(
      buildEarningsAccrualStatements(f.database, {
        orderId: f.orderId,
        now: 120,
      }),
    );
    const report = await getCommissionReport(f.database, {});
    assert.equal(report.rows[0].status, 'cancelled');
    assert.equal(report.totals.originalWaivedPaisa, 1000);
    assert.equal(report.totals.netPaisa, 0);
    assert.equal(report.totals.pendingPaisa, 0);
    assert.equal(
      (await getSellerFinanceSummary(f.database, 'seller-a')).grossSalesPaisa,
      0,
    );
    assert.equal(
      (await repository.readOrderMarketplaceFees(f.database, [f.itemId])).get(
        f.itemId,
      )?.netPaisa,
      0,
    );
  } finally {
    await f.dispose();
  }
});

for (const waived of [false, true])
  void test(`${waived ? 'waived' : 'ordinary'} multi-quantity partial returns use cumulative rounded reversals and preserve original fee snapshots`, async (t) => {
    let clock=100;
    t.mock.method(Date, 'now', () => clock);
    const f = await checkout(waived, 3, 5);
    try {
      clock=200;
      await deliver(f);
      for (let index = 1; index <= 3; index++) {
        clock=240+index;
        await refund(f, index, 5);
        await f.database.batch(
          buildEarningsAccrualStatements(f.database, {
            orderId: f.orderId,
            now: 300 + index,
          }),
        );
        const report = await getCommissionReport(f.database, {});
        assert.equal(report.totals.originalStandardPaisa, 2);
        assert.equal(report.totals.originalWaivedPaisa, waived ? 2 : 0);
        assert.equal(report.rows[0].originalCommissionPaisa, waived ? 0 : 2);
        assert.equal(
          report.totals.reversedPaisa,
          waived ? 0 : index === 3 ? 2 : 1,
        );
        assert.equal(report.totals.netPaisa, waived ? 0 : index === 3 ? 0 : 1);
        const summary = await getSellerFinanceSummary(
          f.database,
          'seller-a',
          100 * 86400000,
        );
        assert.equal(
          summary.availablePaisa,
          (waived ? 15-index*5 : index===3 ? 0 : 14-index*5)-index*5000,
        );
      }
      assert.deepEqual(
        f.sqlite
          .prepare(
            'SELECT commission_reversal_paisa n FROM refunds ORDER BY processed_at',
          )
          .all()
          .map((r) => r.n),
        waived ? [0, 0, 0] : [1, 0, 1],
      );
      assert.equal(
        (await repository.readOrderMarketplaceFees(f.database, [f.itemId])).get(
          f.itemId,
        )?.standardPaisa,
        2,
      );
    } finally {
      await f.dispose();
    }
  });

void test('promo contribution ignores legacy seller waiver while preserving discount eligibility and cost', () => {
  const terms = {
    code: 'SAVE',
    label: 'Fictional discount',
    kind: 'fixed' as const,
    fixedPaisa: 500,
    minimumSubtotalPaisa: 0,
    startsAt: 0,
    endsAt: 1000,
    totalUseLimit: 10,
    perCustomerUseLimit: 1,
    budgetPaisa: 5000,
  };
  const ordinary = promoCostPreview(terms, 10000, 1000);
  const waived = promoCostPreview(terms, 10000, 1000, {
    ...feeWaiverTerms,
    id: 'campaign',
    revision: 2,
    state: 'published',
  });
  assert.equal(ordinary.commissionPaisa, 1000);
  assert.equal(ordinary.contributionPaisa, 500);
  assert.equal(waived.commissionPaisa, 1000);
  assert.equal(waived.standardCommissionPaisa, 1000);
  assert.equal(waived.waivedCommissionPaisa, 0);
  assert.equal(waived.contributionPaisa, 500);
  assert.equal(waived.discountPaisa, ordinary.discountPaisa);
  assert.equal(waived.eligible, ordinary.eligible);
});
