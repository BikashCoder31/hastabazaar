import assert from 'node:assert/strict';
import test from 'node:test';
import * as health from '../lib/operations/service-health';
const now = 2_000_000_000_000;
const observation = (
  at: number,
  successful = true,
  backlog = 0,
  progress = 0,
) => ({
  id: String(at),
  serviceKey: 'email.sender',
  runKey: String(at),
  observedAt: at,
  successful,
  functionalSuccess: successful,
  eligibleBacklog: backlog,
  oldestEligibleAt: null,
  progressCount: progress,
  failureCategory: null,
  sourceKind: 'sender' as const,
});
void test('event-driven form evidence becomes stale unknown without fabricating a missing scheduled job',()=>{
 const classify=Reflect.get(health,'classifyServiceHealth');
 assert.equal(classify([observation(now-600_000)],now-900_000,now,'event').state,'unknown');
 assert.equal(classify([observation(now)],null,now,'event').state,'healthy');
 assert.equal(classify([],now-900_000,now,'event').state,'unknown');
});
void test('current evidence scope cannot inherit old-release green while preserving the real heartbeat clock',()=>{
 const classify=Reflect.get(health,'classifyServiceHealth');
 const old={...observation(now-60_000),evidenceScope:'release-old'};
 assert.equal(classify([old],now-900_000,now,'scheduled','release-current').state,'unknown');
 assert.equal(classify([old],now-900_000,now,'scheduled','release-current').reason,'evidence_scope_unverified');
 assert.equal(classify([{...old,observedAt:now-600_000}],now-900_000,now,'scheduled','release-current').reason,'heartbeat_overdue');
});
void test('missing evidence is unknown and sender/evaluator expected success is overdue only after five minutes', () => {
  const classify = Reflect.get(health, 'classifyServiceHealth');
  assert.equal(typeof classify, 'function');
  assert.equal(classify([], now, now).state, 'unknown');
  assert.equal(classify([], now - 300001, now).state, 'action_needed');
  assert.equal(
    classify([observation(now - 300001)], now - 900000, now).reason,
    'heartbeat_overdue',
  );
  assert.equal(
    classify([observation(now)], now - 900000, now).state,
    'healthy',
  );
});
void test('recovery needs two real consecutive successful runs one minute apart and progressing or clear eligible backlog', () => {
  const recover = Reflect.get(health, 'hasServiceRecoveryEvidence');
  assert.equal(typeof recover, 'function');
  assert.equal(recover([observation(now)], now - 100000), false);
  assert.equal(
    recover([observation(now - 30000), observation(now)], now - 100000),
    false,
  );
  assert.equal(
    recover(
      [observation(now - 60000, true, 4), observation(now, true, 4)],
      now - 100000,
    ),
    false,
  );
  assert.equal(
    recover(
      [observation(now - 60000, true, 4), observation(now, true, 3, 1)],
      now - 100000,
    ),
    true,
  );
  assert.equal(
    recover(
      [
        observation(now - 60000),
        observation(now - 30000, false),
        observation(now),
      ],
      now - 100000,
    ),
    false,
  );
  assert.equal(
    recover([observation(now - 60000), observation(now)], now - 100000),
    true,
  );
});
void test('eligible first attempts and provider failures need attention while recipient problems do not invent a provider outage', () => {
  const classify = Reflect.get(health, 'classifyServiceHealth');
  assert.equal(
    classify(
      [
        {
          ...observation(now),
          eligibleBacklog: 1,
          oldestEligibleAt: now - 300001,
        },
      ],
      now - 900000,
      now,
    ).reason,
    'first_attempt_overdue',
  );
  assert.equal(
    classify(
      [{ ...observation(now, false), failureCategory: 'recipient' }],
      now,
      now,
    ).state,
    'degraded',
  );
  assert.equal(
    classify(
      [{ ...observation(now, false), failureCategory: 'unknown' }],
      now,
      now,
    ).state,
    'unknown',
  );
  assert.equal(
    classify(
      [observation(now - 60000, false), observation(now, false)],
      now,
      now,
    ).state,
    'action_needed',
  );
});
void test('recent manual success does not certify automatic operation without an explicit expected schedule', () => {
  const classify = Reflect.get(health, 'classifyServiceHealth');
  assert.equal(classify([observation(now)], null, now).state, 'unknown');
  assert.equal(classify([observation(now)], now + 1, now).state, 'unknown');
});

void test('empty successful workers are unknown and cannot close a real outage without functional evidence', () => {
  const classify = Reflect.get(health, 'classifyServiceHealth'),
    recover = Reflect.get(health, 'hasServiceRecoveryEvidence');
  const empty = [
    { ...observation(now - 60000), functionalSuccess: false },
    { ...observation(now), functionalSuccess: false },
  ];
  assert.equal(classify(empty, now - 900000, now).state, 'unknown');
  assert.equal(recover(empty, now - 100000), false);
});
void test('recipient-specific faults with a real successful functional probe remain degraded without a provider outage or recovery', () => {
  const classify = Reflect.get(health, 'classifyServiceHealth'),
    recover = Reflect.get(health, 'hasServiceRecoveryEvidence');
  const rows = [
    {
      ...observation(now - 60000, false),
      functionalSuccess: true,
      failureCategory: 'recipient' as const,
    },
    {
      ...observation(now, false),
      functionalSuccess: true,
      failureCategory: 'recipient' as const,
    },
  ];
  assert.equal(classify(rows, now - 900000, now).state, 'degraded');
  assert.equal(
    classify(rows, now - 900000, now).reason,
    'recipient_correction',
  );
  assert.equal(
    classify(rows, now - 900000, now).lastSuccessfulAt,
    null,
    'A passing probe is not a successful failed worker run',
  );
  assert.equal(recover(rows, now - 100000), false);
});
