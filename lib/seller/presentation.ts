/** Presentation only: authoritative permission and eligibility checks remain server-side. */
export function sellerMoney(paisa: number): string {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

export function sellerDate(value: number): string {
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));
}

export function payoutRequestBlock(
  availablePaisa: number,
  hasOpenRequest: boolean,
): string | null {
  if (hasOpenRequest) return 'Your payout request is awaiting Admin review.';
  if (availablePaisa <= 0)
    return 'Requests open when you have a positive available balance.';
  return null;
}

export function canEditSellerInventory(status: string): boolean {
  return [
    'draft',
    'submitted',
    'under_review',
    'needs_changes',
    'approved',
    'published',
  ].includes(status);
}
