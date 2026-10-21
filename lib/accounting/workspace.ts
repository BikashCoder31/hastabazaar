import { readAccountingSources } from './source-queries';
import { projectAccounting } from './projection';
import type { AccountingQuery, AccountingWorkspace } from './types';

export async function getAccountingWorkspace(
  db: D1Database,
  query: AccountingQuery,
  observedAt: number,
  environment: string,
): Promise<AccountingWorkspace> {
  return projectAccounting(
    await readAccountingSources(db, query, observedAt, environment),
    query,
  );
}
