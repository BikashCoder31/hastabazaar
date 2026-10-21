import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { accountingFixture } from './helpers/accounting-fixture';
import { parseAccountingQuery } from '../lib/accounting/filters';
import { readAccountingSources } from '../lib/accounting/source-queries';

const python = process.env.HASTABAZAAR_TEST_PYTHON ?? 'python';
const available =
  spawnSync(
    python,
    ['-c', 'import sqlite3; assert hasattr(sqlite3.Connection,"setlimit")'],
    { encoding: 'utf8' },
  ).status === 0;
// Workerd applies this actual SQLite connection limit. Ordinary node:sqlite uses500.
// Only a synthetic :memory: schema is passed to Python; no retained path is opened.
void test(
  'Accounting executes one financial statement under the worker five-branch compound SELECT limit',
  { skip: !available },
  async () => {
    const f = await accountingFixture();
    try {
      const now = Date.parse('2026-10-18T05:00:00Z');
      f.insert('parcel_cash_records', {
        id: 'collection',
        kind: 'collection',
        status: 'posted',
        amount_paisa: 12345,
        created_at: now - 1,
      });
      const tables = f.sqlite
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as { name: string; sql: string }[];
      const fixture = tables.map((t) => ({
        ...t,
        rows: f.sqlite.prepare(`SELECT * FROM "${t.name}"`).all(),
      }));
      let financialReads = 0;
      const db = {
        prepare(sql: string) {
          if (!sql.startsWith('WITH ')) return f.db.prepare(sql);
          let bindings: unknown[] = [];
          const prepared = {
            bind(...values: unknown[]) {
              bindings = values;
              return prepared;
            },
            async all() {
              financialReads++;
              const script = `import json,sqlite3,sys
d=json.load(sys.stdin)
c=sqlite3.connect(':memory:')
for t in d['fixture']:
 c.execute(t['sql'])
 for r in t['rows']:
  names=list(r.keys())
  c.execute('INSERT INTO "'+t['name']+'" ('+','.join('"'+n+'"' for n in names)+') VALUES ('+','.join('?' for n in names)+')',[r[n] for n in names])
c.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT,5)
c.setlimit(sqlite3.SQLITE_LIMIT_COLUMN,100)
c.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,100)
c.setlimit(sqlite3.SQLITE_LIMIT_VDBE_OP,25000)
c.row_factory=sqlite3.Row
try:
 print(json.dumps({'results':[dict(r) for r in c.execute(d['sql'],d['bindings'])]}))
except (sqlite3.Error,MemoryError) as e:
 print(json.dumps({'error':str(e)}))
finally:
 c.close()
`;
              const run = spawnSync(python, ['-c', script], {
                input: JSON.stringify({ fixture, sql, bindings }),
                encoding: 'utf8',
                maxBuffer: 2 * 1024 * 1024,
              });
              assert.equal(run.status, 0, run.stderr);
              const result = JSON.parse(run.stdout) as {
                error?: string;
                results?: unknown[];
              };
              if (result.error) throw Error(result.error);
              return { results: result.results };
            },
          };
          return prepared;
        },
      } as unknown as D1Database;
      const result = await readAccountingSources(
        db,
        parseAccountingQuery(new URLSearchParams('period=all'), now),
        now,
        'Isolated worker-limit fixture',
      );
      assert.equal(
        result.metrics.find((m) => m.key === 'cod_collected')?.amountPaisa,
        '12345',
        JSON.stringify(result.issues),
      );
      assert.equal(result.rows[0]?.sourceId, 'collection');
      assert.equal(financialReads, 1);
      assert.ok(result.coverage.every((c) => c.available));
    } finally {
      f.dispose();
    }
  },
);
