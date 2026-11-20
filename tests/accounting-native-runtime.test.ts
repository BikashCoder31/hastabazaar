import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNativeFixtureScope } from './helpers/native-fixture-scope';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { parseAccountingQuery } from '../lib/accounting/filters';
import { readAccountingSources } from '../lib/accounting/source-queries';

// Never load native connections before validating the dedicated fictional scope.
const staging = process.env.HATSKALA_STAGING_NATIVE === '1';
const enabled = staging || process.env.HATSKALA_MARIADB_RELEASE === '1';
void test(
  'Accounting reads the guarded fictional MariaDB schema with exact aggregate strings',
  { skip: !enabled },
  async () => {
    const scope = staging ? await stagingNativeFixture() : await assertNativeFixtureScope();
    assert.match(scope.database, /^(?:release|native)_\d+_fresh$/);
    const mysql = await import('mysql2/promise');
    const pools: import('mysql2/promise').Pool[] = [];
    const createPool = mysql.default.createPool;
    mysql.default.createPool = ((...args: Parameters<typeof createPool>) => {
      const pool = createPool(...args);
      pools.push(pool);
      return pool;
    }) as typeof createPool;
    try {
      const { env } = await import('../lib/runtime/node-bindings');
      const now = Date.now();
      const nativeErrors:string[]=[];
      const observed={dialect:'mariadb',prepare(sql:string){
        const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,property){
          if(property==='bind')return(...values:unknown[])=>wrap(target.bind(...values));
          if(property==='all')return async()=>{try{return await target.all();}catch(error){const detail=error as {code?:string;sqlMessage?:string};nativeErrors.push(String(detail.code??'driver_error')+': '+String(detail.sqlMessage??'Native query failed').slice(0,500));throw error;}};
          const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
        }});
        return wrap(env.DB.prepare(sql));
      }} as unknown as D1Database;
      const result = await readAccountingSources(
        observed,
        parseAccountingQuery(new URLSearchParams('period=all'), now),
        now,
        'Disposable MariaDB fixture',
      );
      assert.ok(
        result.coverage.every((s) => s.available),
        JSON.stringify({issues:result.issues,nativeErrors}),
      );
      for (const metric of result.metrics)
        if (metric.amountPaisa !== null)
          assert.match(metric.amountPaisa, /^-?\d+$/);
    } finally {
      mysql.default.createPool = createPool;
      for (const pool of pools) await pool.end();
    }
  },
);
