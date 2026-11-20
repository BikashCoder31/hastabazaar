/** New owning-feature contracts retain their readiness checks independently of editor placement.
 * These fixed controls use their native schema/validators, not published extra questions.
 */
export const FIXED_PREVIEW_FORM_IDS:ReadonlySet<string>=new Set([
 'system.recovery-finance','system.recovery-seller',
 'system.managed-live-activation','system.managed-live-evidence','system.managed-live-finance','system.live-invoice-adjustment',
 'system.payout-finance','system.refund-evidence','system.finance-evidence','system.refund-finance','system.refund-destination',
 'system.common-fee-policy','system.fee-terms-acceptance','system.fee-terms-followup',
 'system.category-policy','system.company-bank-account',
]);
export const PROTECTED_PREVIEW_FORM_IDS=Object.freeze(['staff.team-governance','staff.incident-review']);
