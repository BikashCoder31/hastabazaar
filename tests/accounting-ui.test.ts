import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { registerHooks } from 'node:module';
import { parseAccountingQuery } from '../lib/accounting/filters';
import type { AccountingWorkspace } from '../lib/accounting/types';
const now = Date.parse('2026-10-18T05:00:00Z');
(
  globalThis as typeof globalThis & {
    accountingUiCreateElement: typeof createElement;
  }
).accountingUiCreateElement = createElement;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/link')
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            "export default function Link({children,prefetch,...props}){return globalThis.accountingUiCreateElement('a',props,children)}",
          ),
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
void test('Accounting shows six sections, Nepal filters, exact signed money, provenance and honest missing books', async () => {
  const ui = await import('../components/admin/accounting-workspace').catch(
    () => null,
  );
  assert.ok(ui, 'Accounting workspace component must exist');
  const workspace: AccountingWorkspace = {
    query: parseAccountingQuery(
      new URLSearchParams(
        'section=makers&period=custom&from=2026-10-01&to=2026-10-18',
      ),
      now,
    ),
    observedAt: now,
    environment: 'Local staging · simulated records',
    metrics: [
      {
        key: 'maker_balance',
        label: 'Maker unpaid ledger balance',
        amountPaisa: '-900719925474099301',
        status: 'available',
        basis: 'current_position',
        sourceKinds: ['maker_settlement_entry'],
        explanation: 'Original recorded entries.',
      },
      {
        key: 'maker_payable',
        label: 'Maker eligible position',
        amountPaisa: '0',
        status: 'available',
        basis: 'current_position',
        sourceKinds: ['maker_entitlement'],
        explanation: 'Saved checks.',
      },
    ],
    rows: [
      {
        sourceKind: 'maker_settlement_entry',
        sourceId: 'long-id-'.repeat(30),
        reference: 'Original earning',
        recordedAt: now - 1000,
        amountPaisa: '-1',
        points: null,
        state: 'adjustment',
        model: 'managed_sale_linked_percentage_v1',
      },
    ],
    issues: [],
    coverage: [{ source: 'makers', available: true, rowCount: 201 }],
    nextCursor: 'fixture-next',
  };
  const html = renderToStaticMarkup(
    createElement(ui.AccountingWorkspaceView, { workspace }),
  ).replaceAll('&amp;', '&');
  for (const label of [
    'Overview',
    'Independent sellers',
    'Managed makers',
    'Cash & refunds',
    'Incentives & credits',
    'Issues',
    'Today',
    'Last 7 days',
    'Last 30 days',
    'All time',
    'Apply custom dates',
    'Asia/Kathmandu',
    'Local staging',
    'Observed',
    'Current position',
    'saved rates and terms',
    'bank balances are not connected',
    'NPR 0.00',
    '-NPR 9,007,199,254,740,993.01',
    '-NPR 0.01',
    'Original earning',
    '201',
  ])
    assert.ok(html.includes(label), label);
  assert.match(html, /cursor=fixture-next/);
  assert.match(html, /from=2026-10-01/);
  assert.match(html, /to=2026-10-18/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /<label[^>]*for="accounting-from"/);
  assert.doesNotMatch(html, /9% company \/ 91% maker/);
  assert.doesNotMatch(
    html,
    /<button[^>]*>[^<]*(Publish|Prepare|Mark paid|Export|Claim|Redeem|Import)/i,
  );
  assert.doesNotMatch(html, /<img|href="\/account\/wallet|method="post"/i);
});
void test('Accounting separates current 12% / 88% terms from the original 9% recorded amounts', async () => {
  const {AccountingWorkspaceView}=await import('../components/admin/accounting-workspace');
  const workspace:AccountingWorkspace={query:parseAccountingQuery(new URLSearchParams('period=all'),now),observedAt:now,environment:'Local staging',issues:[],coverage:[],rows:[],nextCursor:null,
    metrics:[{key:'maker_company_retention',label:'Original company retention',amountPaisa:'9000',status:'available',basis:'period_flow',sourceKinds:['maker_entitlement'],explanation:'Saved historical amount'},
      {key:'maker_balance',label:'Maker unpaid ledger balance',amountPaisa:'91000',status:'available',basis:'current_position',sourceKinds:['maker_settlement_entry'],explanation:'Original recorded ledger'}]};
  const html=renderToStaticMarkup(createElement(AccountingWorkspaceView,{workspace,currentRates:{sellerCommissionBps:1200,managedRetentionBps:1200,observedAt:now}}));
  assert.match(html,/12% company/);assert.match(html,/88% maker/);assert.match(html,/88% seller/);
  assert.match(html,/newly accepted sales/);assert.match(html,/NPR 90\.00/);assert.match(html,/NPR 910\.00/);assert.doesNotMatch(html,/NPR 880\.00/);
  assert.doesNotMatch(html,/method="post"/);
});

void test('Accounting distinguishes confirmed empty data from source failure and validation errors', async () => {
  const ui = await import('../components/admin/accounting-workspace').catch(
    () => null,
  );
  assert.ok(ui);
  const w: AccountingWorkspace = {
    query: parseAccountingQuery(new URLSearchParams(), now),
    observedAt: now,
    environment: 'Fixture',
    metrics: [],
    rows: [],
    issues: [],
    coverage: [{ source: 'sellers', available: true, rowCount: 0 }],
    nextCursor: null,
  };
  let html = renderToStaticMarkup(
    createElement(ui.AccountingWorkspaceView, { workspace: w }),
  );
  assert.match(html, /No recorded rows in this period/);
  const withoutRates=renderToStaticMarkup(createElement(ui.AccountingWorkspaceView,{workspace:w,currentRates:null}));
  assert.match(withoutRates,/Current commercial terms are unavailable/);
  assert.match(withoutRates,/No recorded rows in this period/);
  html = renderToStaticMarkup(
    createElement(ui.AccountingWorkspaceView, {
      workspace: {
        ...w,
        issues: [
          { code: 'source_unavailable', message: 'Records unavailable.' },
        ],
        coverage: [{ source: 'sellers', available: false, rowCount: 0 }],
      },
    }),
  );
  assert.match(html, /Records unavailable/);
  assert.doesNotMatch(html, /No recorded rows in this period/);
  assert.match(html, /Reload report/);
  html = renderToStaticMarkup(
    createElement(ui.AccountingFilterError, {
      message: 'Choose a valid report date.',
    }),
  );
  assert.match(html, /Choose a valid report date/);
  assert.match(html, /Start a new report/);
});
