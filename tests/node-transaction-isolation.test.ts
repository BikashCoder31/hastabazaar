import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

void test('Node D1 batches read committed guards after acquiring their row locks', async () => {
  const calls: string[] = [];
  const key = Symbol.for('hastabazaar.test.transaction-isolation');
  Reflect.set(globalThis, key, calls);
  try {
    const bundled = await build({
      entryPoints: [fileURLToPath(new URL('../lib/runtime/node-bindings.ts', import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
      plugins: [{ name: 'local-mysql-transport', setup(builder) {
        builder.onResolve({ filter: /^mysql2\/promise$/ }, () => ({ path: 'mysql', namespace: 'test-mysql' }));
        builder.onLoad({ filter: /^mysql$/, namespace: 'test-mysql' }, () => ({
          contents: `const calls=globalThis[Symbol.for('hastabazaar.test.transaction-isolation')];
            const connection={
              async query(sql){calls.push(sql);return [[],[]]},
              async beginTransaction(){calls.push('BEGIN')},
              async execute(sql){calls.push(sql);
                if(sql.includes("json_extract('invalid'")) return sql.trim().startsWith('SELECT')
                  ? [[{valid:null}],[]] : [{affectedRows:1,insertId:0,warningStatus:1},[]];
                return [{affectedRows:1,insertId:0},[]]},
              async commit(){calls.push('COMMIT')},
              async rollback(){calls.push('ROLLBACK')},
              release(){calls.push('RELEASE')},destroy(){calls.push('DESTROY')}
            };
            export default {createPool(){return {async getConnection(){return connection}}}};`,
          loader: 'js',
        }));
      } }],
    });
    const adapter = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`) as {
      env: { DB: D1Database };
    };
    const keys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
    const before = keys.map((name) => process.env[name]);
    try {
      for (const name of keys) process.env[name] = 'fictional-local-transport';
      for (const table of ['user_sessions', 'refunds', 'managed_entitlements', 'seller_ledger_entries']) {
        calls.length = 0;
        await adapter.env.DB.batch([
          adapter.env.DB.prepare(`UPDATE ${table} SET id=id WHERE id=?`).bind('fictional'),
          adapter.env.DB.prepare('INSERT INTO operation_transaction_guards (id,valid) VALUES (?,1)').bind('guard'),
        ]);
        assert.deepEqual(calls.slice(0, 2), ['SET TRANSACTION ISOLATION LEVEL READ COMMITTED', 'BEGIN'], table);
        assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
        assert.equal(calls.filter((call) => call.startsWith('SET SESSION')).length, 0);
      }
      for (const guard of [
        "SELECT CASE WHEN 0 THEN 1 ELSE json_extract('invalid', '$') END AS valid",
        "INSERT INTO audit_logs(next_json) SELECT CASE WHEN 0 THEN 'ok' ELSE json_extract('invalid', '$') END",
      ]) {
        calls.length = 0;
        await assert.rejects(adapter.env.DB.batch([adapter.env.DB.prepare(guard)]), /transaction guard/i);
        assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
        assert.equal(calls.includes('COMMIT'), false);
      }
    } finally {
      keys.forEach((name, index) => {
        if (before[index] === undefined) delete process.env[name];
        else process.env[name] = before[index];
      });
    }
  } finally {
    Reflect.deleteProperty(globalThis, key);
  }
});
