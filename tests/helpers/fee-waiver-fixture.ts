import { commissionDatabase } from './commission-database';
import type {
  FeeWaiverContext,
  FeeWaiverTerms,
} from '../../lib/marketplace/fee-waivers';

/** Only an in-memory SQLite database; applies real migrations and real transaction rollback. */
export const feeWaiverFixture = commissionDatabase;
export const feeWaiverTerms: FeeWaiverTerms = {
  name: 'Global launch',
  description: 'All marketplace sellers',
  startsAt: 10,
  endsAt: 1000,
};
export function feeWaiverContext(
  requestId: string,
  expectedRevision: number,
  overrides: Partial<FeeWaiverContext> = {},
): FeeWaiverContext {
  return {
    actorId: 'owner',
    authSubject: 'owner',
    requestId,
    expectedRevision,
    now: 100,
    ...overrides,
  };
}
/** Run a real competing transaction after the caller has read state, before its batch. */
export function interleaveFeeWaiverBatch(
  db: D1Database,
  action: () => Promise<unknown>,
): D1Database {
  let used = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          if (!used) {
            used = true;
            await action();
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Commit a real winning request after receipt miss but before the snapshot query executes. */
export function interleaveFeeWaiverStateRead(
  db: D1Database,
  action: () => Promise<unknown>,
): D1Database {
  let used = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare')
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.startsWith('SELECT ctl.revision AS controlRevision'))
            return statement;
          return new Proxy(statement, {
            get(prepared, property) {
              if (property === 'all')
                return async () => {
                  if (!used) {
                    used = true;
                    await action();
                  }
                  return prepared.all();
                };
              const value = Reflect.get(prepared, property);
              return typeof value === 'function' ? value.bind(prepared) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
