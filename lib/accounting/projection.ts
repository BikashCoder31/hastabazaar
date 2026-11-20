import type {
  AccountingQuery,
  AccountingSourceBundle,
  AccountingWorkspace,
} from './types';

/** Preserve independent metrics and provenance. There is deliberately no grand financial total. */
export function projectAccounting(
  bundle: AccountingSourceBundle,
  query: AccountingQuery,
): AccountingWorkspace {
  return { ...bundle, query };
}
