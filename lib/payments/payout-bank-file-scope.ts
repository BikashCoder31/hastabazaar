export const payoutRunRequestPrefix = 'payout-run-';
export const payoutRunRequestGroupLength = payoutRunRequestPrefix.length + 36;
export const payoutRunRequestLength = payoutRunRequestGroupLength + 1 + 32;
export const payoutRunIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
