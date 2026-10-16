import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import * as queue from '../lib/operations/email-queue';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,status TEXT);
    CREATE TABLE order_email_jobs(id TEXT PRIMARY KEY,order_id TEXT,order_status TEXT,created_at INTEGER,
    status TEXT,attempts INTEGER,next_attempt_at INTEGER,lease_until INTEGER,claim_token TEXT,sent_at INTEGER,failure_code TEXT);`);
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...next: SQLInputValue[]) {
          values = next;
          return this;
        },
        async first<T>() {
          return (statement.get(...values) as T) ?? null;
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] };
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
  } as unknown as D1Database;
  const add = (
    id: string,
    reference: string,
    createdAt: number,
    status = 'queued',
    attempts = 0,
    current = 'packing',
    event = 'packing',
  ) => {
    sqlite
      .prepare('INSERT INTO orders VALUES(?,?,?)')
      .run(id, reference, current);
    sqlite
      .prepare(
        'INSERT INTO order_email_jobs VALUES(?,?,?,?,?,?,0,0,NULL,NULL,NULL)',
      )
      .run(id, id, event, createdAt, status, attempts);
  };
  return { sqlite, db, add };
}

interface HistoryRow {
  id: string;
  status: string;
  displayStatus: string;
  skipReason: string | null;
}
type List = (
  db: D1Database,
  params: { q?: string; status?: string; page?: string },
  now: number,
  pageSize?: number,
) => Promise<{
  jobs: HistoryRow[];
  total: number;
  page: number;
  pageCount: number;
}>;
const now = 2_000_000_000_000;

void test('email history searches all records and preserves counts and bounded pages', async () => {
  const f = fixture();
  try {
    for (let i = 1; i <= 65; i++) f.add('job-' + i, 'ORDER-' + i, now - i);
    const list = Reflect.get(queue, 'listOrderEmailHistory') as List;
    assert.equal(
      typeof list,
      'function',
      'Complete-history search is not implemented',
    );
    const result = await list(f.db, { q: 'ORDER-65', page: '99' }, now);
    assert.equal(result.total, 1);
    assert.equal(result.page, 1);
    assert.equal(result.pageCount, 1);
    assert.deepEqual(
      result.jobs.map((row) => row.id),
      ['job-65'],
    );
    const last = await list(f.db, { page: '99' }, now);
    assert.equal(last.total, 65);
    assert.equal(last.page, 2);
    assert.equal(last.jobs.length, 15);
    assert.equal(
      (await list(f.db, { q: '%' }, now)).total,
      0,
      'Search characters are literal',
    );
    assert.equal(
      (await list(f.db, { status: 'not-a-status', page: '-4' }, now)).page,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('staff queue excludes stale updates immediately without changing them during reads', async () => {
  const f = fixture();
  try {
    f.add('expired', 'OLD-1', now - 86_400_000);
    f.add('obsolete', 'OLD-2', now - 1000, 'queued', 0, 'delivered', 'packing');
    f.add('accepted', 'DONE-1', now - 100_000_000, 'sent');
    const summary = await queue.emailQueueSummary(f.db, now);
    assert.equal(summary.due, 0);
    assert.equal(summary.pending, 0);
    const list = Reflect.get(queue, 'listOrderEmailHistory') as List;
    assert.equal(typeof list, 'function');
    const expired = await list(f.db, { status: 'expired' }, now);
    assert.equal(expired.total, 1);
    assert.equal(expired.jobs[0].skipReason, 'expired_order_update');
    assert.equal(expired.jobs[0].status, 'queued');
    assert.equal((await list(f.db, { status: 'skipped' }, now)).total, 2);
    assert.equal((await list(f.db, { status: 'sent' }, now)).total, 1);
    assert.equal(
      f.sqlite
        .prepare("SELECT status FROM order_email_jobs WHERE id='expired'")
        .get()?.status,
      'queued',
    );
    f.sqlite
      .prepare(
        "UPDATE order_email_jobs SET status='sending',lease_until=? WHERE id='expired'",
      )
      .run(now + 60_000);
    assert.equal((await queue.emailQueueSummary(f.db, now)).pending, 1);
    assert.equal(
      (await list(f.db, { status: 'expired' }, now)).total,
      0,
      'Active lease is respected in the staff view',
    );
  } finally {
    f.sqlite.close();
  }
});

void test('email attention filters distinguish retry waiting, exhausted work and ready work', async () => {
  const f = fixture();
  try {
    f.add('ready', 'ORDER-READY', now - 1);
    f.add('retry', 'ORDER-RETRY', now - 2, 'retry', 1);
    f.add('exhausted', 'ORDER-REVIEW', now - 3, 'retry', 5);
    f.add('active-final', 'ORDER-ACTIVE', now - 4, 'sending', 5);
    f.sqlite
      .prepare(
        "UPDATE order_email_jobs SET lease_until=? WHERE id='active-final'",
      )
      .run(now + 60_000);
    f.sqlite
      .prepare("UPDATE order_email_jobs SET next_attempt_at=? WHERE id='retry'")
      .run(now + 60_000);
    const list = Reflect.get(queue, 'listOrderEmailHistory') as List;
    assert.equal(typeof list, 'function');
    assert.deepEqual(
      (await list(f.db, { status: 'ready' }, now)).jobs.map((row) => row.id),
      ['ready'],
    );
    assert.deepEqual(
      (await list(f.db, { status: 'needs_review' }, now)).jobs.map(
        (row) => row.id,
      ),
      ['exhausted'],
    );
    assert.deepEqual(
      (await list(f.db, { status: 'retry' }, now)).jobs.map((row) => row.id),
      ['retry'],
    );
    const summary = await queue.emailQueueSummary(f.db, now);
    assert.equal(summary.due, 1);
    assert.equal(summary.exhausted, 1);
    assert.equal(Reflect.get(summary, 'retryWaiting'), 1);
  } finally {
    f.sqlite.close();
  }
});
