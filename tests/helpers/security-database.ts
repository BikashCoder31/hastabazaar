import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Disposable, in-memory authentication schema. Never opens a retained file. */
export function securityDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY,auth_subject TEXT UNIQUE,email TEXT NOT NULL,display_name TEXT NOT NULL,status TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE user_roles(user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(user_id,role));
    CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY REFERENCES users(id),password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,password_version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL);
    CREATE TABLE account_email_verifications(user_id TEXT PRIMARY KEY,email TEXT,verified_at INTEGER);
    CREATE TABLE marketplace_settings(\`key\` TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by TEXT REFERENCES users(id),updated_at INTEGER NOT NULL);
    CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
    CREATE TABLE request_rate_limits(key TEXT PRIMARY KEY,request_count INTEGER,window_started_at INTEGER,expires_at INTEGER);`);
  const queries: string[] = [];
  let queue = Promise.resolve();
  const db = {
    prepare(sql: string) {
      queries.push(sql);
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      const prepared = {
        bind(...bindings: SQLInputValue[]) { values = bindings; return prepared; },
        async first<T>(column?: string) { const row=statement.get(...values); return row ? (column ? row[column] : {...row}) as T : null; },
        async all<T>() { return {success:true,results:statement.all(...values).map(row=>({...row})) as T[],meta:{changes:0}}; },
        async run() {
          if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) return {success:true,results:statement.all(...values),meta:{changes:0}};
          return {success:true,results:[],meta:{changes:Number(statement.run(...values).changes)}};
        },
      };
      return prepared;
    },
    async batch(statements: {run():Promise<unknown>}[]) {
      const task = queue.then(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try { const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results; }
        catch(error){sqlite.exec('ROLLBACK');throw error;}
      });
      queue=task.then(()=>undefined,()=>undefined);
      return task;
    },
  } as unknown as D1Database;
  return {db,sqlite,queries,dispose:()=>sqlite.close()};
}
