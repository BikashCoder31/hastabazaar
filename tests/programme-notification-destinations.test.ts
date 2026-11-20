import test from 'node:test';
import assert from 'node:assert/strict';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import { publishForm } from './helpers/loyalty-fixture';
import {
  savePromoDraft,
  publishPromo,
  pausePromo,
} from '../lib/db/repositories/promo-codes';
import {
  getLoyaltyState,
  saveLoyaltyDraft,
  publishLoyalty,
} from '../lib/db/repositories/loyalty';
import { readFinancialNoticeDestination } from '../lib/operations/financial-notice-destination';
void test('actual programme publication notices open only their current original internal policy records without marketing data', async () => {
  const f = await incentiveReportDatabase();
  try {
    await seedIncentiveCustomer(f.db, 'super');
    await f.db
      .prepare(
        "INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1)",
      )
      .run();
    for (const form of ['staff.promo-code', 'staff.loyalty-settings'])
      await publishForm(f.db, form);
    const now = Date.now(),
      context = (
        formId: string,
        requestId: string,
        expectedVersion: number,
      ) => ({
        actorId: 'super',
        authSubject: 'super',
        requestId,
        expectedVersion,
        now,
        reason:
          'Publish an independently reviewed fictional internal programme state without distributing marketing.',
        form: {
          formId,
          versionId: formId + '-v1',
          answers: { formId, version: 1, answers: [] },
        },
      });
    const draft = await savePromoDraft(
      f.db,
      context('staff.promo-code', 'destination-promo-draft', 0),
      {
        code: 'PRIVATECANARYCODE',
        label: 'Fictional original promotion',
        kind: 'fixed',
        fixedPaisa: 1000,
        minimumSubtotalPaisa: 0,
        startsAt: now - 1000,
        endsAt: now + 86400000,
        totalUseLimit: 100,
        perCustomerUseLimit: 1,
        budgetPaisa: 987654,
      },
    );
    const live = await publishPromo(
      f.db,
      context('staff.promo-code', 'destination-promo-live', draft.version),
      draft.campaignId,
    );
    const promo = await readFinancialNoticeDestination(
      f.db,
      {
        actorId: 'super',
        audience: 'staff',
        type: 'promo_campaign_notice',
        id: draft.campaignId,
      },
      now,
    );
    assert.ok(promo);
    assert.equal(promo.recordId, draft.campaignId);
    assert.equal(promo.actionHref, '/admin/promo-codes?campaign='+encodeURIComponent(draft.campaignId)+'#manage');
    assert.equal(promo.status, 'promo_published');
    assert.doesNotMatch(
      JSON.stringify(promo),
      /PRIVATECANARYCODE|987654|totalUseLimit|customerList/,
    );
    assert.equal(
      await readFinancialNoticeDestination(
        f.db,
        {
          actorId: 'super',
          audience: 'customer',
          type: 'promo_campaign_notice',
          id: draft.campaignId,
        },
        now,
      ),
      null,
    );
    await pausePromo(
      f.db,
      context('staff.promo-code', 'destination-promo-paused', live.version),
      draft.campaignId,
    );
    const paused = await readFinancialNoticeDestination(
      f.db,
      {
        actorId: 'super',
        audience: 'staff',
        type: 'promo_campaign_notice',
        id: draft.campaignId,
      },
      now,
    );
    assert.equal(paused!.status, 'promo_paused');
    const initial = await getLoyaltyState(f.db, 'super', now, 'super'),
      loyaltyDraft = await saveLoyaltyDraft(
        f.db,
        context(
          'staff.loyalty-settings',
          'destination-loyalty-draft',
          initial.version,
        ),
        {
          enabled: true,
          dailyPoints: 100,
          pointsPerBlock: 100,
          creditPaisaPerBlock: 1000,
          startsAt: now - 1000,
          endsAt: now + 86400000,
          dailyBudgetPoints: 123400,
          lifetimeBudgetPoints: 1234000,
        },
      );
    await publishLoyalty(
      f.db,
      context(
        'staff.loyalty-settings',
        'destination-loyalty-live',
        loyaltyDraft.version,
      ),
    );
    const loyalty = await readFinancialNoticeDestination(
      f.db,
      {
        actorId: 'super',
        audience: 'staff',
        type: 'loyalty_programme_notice',
        id: 'default',
      },
      now,
    );
    assert.ok(loyalty);
    assert.equal(loyalty.recordId, 'default');
    assert.equal(loyalty.actionHref, '/admin/loyalty');
    assert.doesNotMatch(
      JSON.stringify(loyalty),
      /123400|dailyBudgetPoints|lifetimeBudgetPoints|issuedPoints/,
    );
  } finally {
    f.dispose();
  }
});
