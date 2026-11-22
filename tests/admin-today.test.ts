import assert from 'node:assert/strict';
import test from 'node:test';
import { oldestAvailableTodayTask, todayQueue, type TodayTask } from '../components/admin/overview-today-model';
import { overviewHealthChecks } from '../components/admin/overview-health-model';
import type { SystemHealthOverview } from '../lib/operations/system-health-workspace';

const now = Date.parse('2026-11-20T09:00:00+05:45');

function task(id: string, overrides: Partial<TodayTask> = {}): TodayTask {
  return {
    id, section: 'Orders', type: 'Order follow-up', title: id, context: 'Original record',
    startedAt: now - 100, dueAt: null, state: 'action', ownerId: null, ownerName: null,
    assignment: { taskId: id, revision: 1 }, href: '/admin/orders', action: 'Open order', ...overrides,
  };
}

void test('Today sorts overdue first and then by original age while claiming the oldest eligible unowned task', () => {
  const rows = [
    task('routine oldest', { startedAt: now - 300 }),
    task('overdue newest', { dueAt: now - 50 }),
    task('overdue older', { startedAt: now - 200, dueAt: now - 10 }),
    task('assigned', { ownerId: 'staff', dueAt: now + 1 }),
    task('waiting', { state: 'waiting', dueAt: now - 500 }),
    task('done', { state: 'done', assignment: null }),
  ];
  const queue = todayQueue(rows, 'staff', now, { section: '', type: '', from: '', to: '' });
  assert.deepEqual(queue.action.map(row => row.id), ['overdue older', 'overdue newest', 'routine oldest', 'assigned']);
  assert.deepEqual(queue.mine.map(row => row.id), ['assigned']);
  assert.deepEqual(queue.unowned.map(row => row.id), ['overdue older', 'overdue newest', 'routine oldest']);
  assert.deepEqual(queue.waiting.map(row => row.id), ['waiting']);
  assert.deepEqual(queue.done.map(row => row.id), ['done']);
  assert.equal(oldestAvailableTodayTask(rows)?.id, 'routine oldest');
});

void test('Today filters by its displayed section, type and inclusive Nepal calendar days', () => {
  const midnight = Date.parse('2026-11-20T00:00:00+05:45');
  const rows = [
    task('previous day', { startedAt: midnight - 1 }),
    task('matching', { startedAt: midnight }),
    task('wrong section', { section: 'Sellers', startedAt: midnight + 10 }),
    task('wrong type', { type: 'Parcel follow-up', startedAt: midnight + 10 }),
  ];
  const result = todayQueue(rows, 'staff', now, { section: 'Orders', type: 'Order follow-up', from: '2026-11-20', to: '2026-11-20' });
  assert.deepEqual(result.action.map(row => row.id), ['matching']);
});

void test('Today keeps unobserved checks visibly unknown and recognizes a missed expected heartbeat', () => {
  const overview = {
    services: [
      { serviceKey: 'database.readiness', state: 'healthy', lastObservedAt: now },
      { serviceKey: 'email.evaluator', state: 'action_needed', lastObservedAt: null },
      { serviceKey: 'files.public', state: 'healthy', lastObservedAt: now },
    ],
  } as SystemHealthOverview;
  assert.deepEqual(overviewHealthChecks(overview), [
    { label: 'Database', text: 'Working', tone: 'good' },
    { label: 'Order emails', text: 'Not checked yet', tone: 'issue' },
    { label: 'Storage', text: 'Not checked yet', tone: 'unknown' },
  ]);
});
