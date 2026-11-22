/** Pure source guard: a statement cannot fund a new instruction after an actual
 * later bank reversal on that logical account. Never infer a replacement balance. */
export const FUNDING_BANK_REVERSAL_REVERIFY_CODE='funding_reverify_bank_balance_after_reversal_required';
export const FUNDING_BANK_REVERSAL_REVERIFY_MESSAGE='Reverify the current bank balance after the receipt reversal before preparing, approving or starting another transfer.';
export function fundingStatementBankReversalFreshSql(statement='s'){
 if(!/^[a-z_]+$/.test(statement))throw new Error('Use an internal funding statement alias.');
 return `NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed JOIN company_money_receipts receipt ON receipt.id=reversed.receipt_id JOIN company_payment_account_versions bank_version ON bank_version.id=receipt.account_version_id WHERE bank_version.account_id=${statement}.account_id AND reversed.bank_at>${statement}.as_of)`;
}
export function isFundingBankReversalFreshnessError(error:unknown){return error instanceof Error&&error.message.includes(FUNDING_BANK_REVERSAL_REVERIFY_CODE);}
