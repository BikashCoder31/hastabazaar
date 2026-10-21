import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateManagedSaleLinkedAmounts } from '../lib/managed-makers/settlement';

const NOW = Date.parse('2026-10-18T05:00:00Z');
void test('Accounting keeps exact paisa and the approved maker split', async () => {
  const money = await import('../lib/accounting/money').catch(() => null);
  assert.ok(money, 'Accounting exact money module must exist');
  assert.equal(money.sumPaisa(['9007199254740991', '1']), '9007199254740992');
  assert.equal(money.sumPaisa(['-100', '50']), '-50');
  assert.equal(money.paisa('-0'), '0');
  assert.equal(money.formatPaisa('9000'), 'NPR 90.00');
  assert.equal(money.formatPaisa('-1'), '-NPR 0.01');
  assert.equal(
    money.formatPaisa('9007199254740992'),
    'NPR 90,071,992,547,409.92',
  );
  for (const bad of [
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    1.5,
    '1.5',
    ' 1',
    '1e3',
    '01',
    '--1',
  ])
    assert.throws(() => money.paisa(bad));
  const split = calculateManagedSaleLinkedAmounts({
    eligibleBasePaisa: 100000,
    platformRetentionBps: 900,
  });
  assert.equal(split.platformRetainedPaisa, 9000);
  assert.equal(split.makerEntitlementPaisa, 91000);
});
void test('Accounting filter has an inventoried native query contract without a new publication requirement', async () => {
  const { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } =
    await import('../lib/forms/registry');
  const { isFormCatalogEditable } =
    await import('../lib/forms/catalog-presentation');
  const definition = FORM_REGISTRY['staff.accounting-report-filter'];
  assert.ok(definition, 'Accounting native filter must be inventoried');
  assert.equal(definition.mode, 'query');
  assert.equal(definition.route, '/admin/accounting');
  assert.equal(definition.audience, 'super_admin');
  assert.equal(definition.capabilities.answerBehavior, 'query');
  assert.deepEqual(definition.capabilities.customFieldTypes, []);
  assert.ok(definition.baseFields.every((f) => f.capability === 'protected'));
  assert.equal(isFormCatalogEditable(definition), false);
  assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[definition.id], {
    formId: definition.id,
    route: definition.route,
    mode: definition.mode,
  });
});
void test('Accounting filters use Nepal calendar boundaries and strict query validation', async () => {
  const filters = await import('../lib/accounting/filters').catch(() => null);
  assert.ok(filters, 'Accounting filter module must exist');
  const parse = (s: string) =>
    filters.parseAccountingQuery(new URLSearchParams(s), NOW);
  assert.equal(parse('').section, 'overview');
  assert.equal(parse('').period, '30d');
  assert.equal(parse('').pageSize, 50);
  assert.equal(
    parse('period=today').fromAt,
    Date.parse('2026-10-17T18:15:00Z'),
  );
  assert.equal(
    parse('period=today').toExclusive,
    Date.parse('2026-10-18T18:15:00Z'),
  );
  assert.equal(parse('period=7d').fromAt, Date.parse('2026-10-11T18:15:00Z'));
  assert.equal(parse('period=30d').fromAt, Date.parse('2026-09-18T18:15:00Z'));
  assert.equal(parse('period=all').toExclusive, NOW + 1);
  assert.equal(
    parse('period=custom&from=2024-02-29&to=2024-02-29').toExclusive,
    Date.parse('2024-02-29T18:15:00Z'),
  );
  for (const s of [
    'period=custom&from=2026-02-30&to=2026-03-01',
    'period=custom&from=2026-10-18',
    'period=today&from=2026-01-01',
    'period=no',
    'section=secret',
    'pageSize=101',
    'pageSize=2.5',
    'period=all&period=today',
    'x=1',
    'cursor=bad',
  ])
    assert.throws(() => parse(s), Error, s);
  const base = parse('period=all&section=makers');
  const cursor = filters.encodeAccountingCursor(base, {
    recordedAt: 2,
    sourceKind: 'maker_entitlement',
    sourceId: 'e1',
  });
  assert.equal(
    parse(`period=all&section=makers&cursor=${encodeURIComponent(cursor)}`)
      .cursor?.sourceId,
    'e1',
  );
  assert.equal(
    filters.parseAccountingQuery(
      new URLSearchParams(
        `period=all&section=makers&cursor=${encodeURIComponent(cursor)}`,
      ),
      NOW + 10000,
    ).toExclusive,
    NOW + 1,
  );
  assert.throws(() =>
    parse(`period=today&section=makers&cursor=${encodeURIComponent(cursor)}`),
  );
  const midnight = filters.parseAccountingQuery(
    new URLSearchParams('period=today'),
    Date.parse('2026-01-01T18:15:00Z'),
  );
  assert.equal(midnight.fromAt, Date.parse('2026-01-01T18:15:00Z'));
});
