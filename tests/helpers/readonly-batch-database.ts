import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
const readonly=Symbol('actual-sqlite-select-batch');
/** The historical fixture's run-only batch omits SELECT rows. Execute real SELECTs
 * through all() in one real SQLite transaction, matching D1's batch contract.
 * Mutation batches retain the original fixture implementation and all triggers. */
export function readonlyBatchDatabase(db:D1Database,sqlite:DatabaseSync):D1Database{
 assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 return new Proxy(db,{get(target,key){if(key==='prepare')return(sql:string)=>{const statement=target.prepare(sql);Object.defineProperty(statement,readonly,{value:/^SELECT\s/i.test(sql)});return statement;};if(key==='batch')return async<T>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>=>{if(!statements.every(statement=>Reflect.get(statement,readonly)===true))return target.batch<T>(statements);sqlite.exec('BEGIN');try{const results:D1Result<T>[]=[];for(const statement of statements)results.push(await statement.all<T>());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
}
