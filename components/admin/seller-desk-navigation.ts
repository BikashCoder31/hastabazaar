import type { SellerDeskItem } from '@/lib/admin/seller-desk';

export const deskFilters = [
  ['all', 'All'], ['products', 'Products'], ['applications', 'Applications'],
  ['documents', 'Documents & fixes'], ['payouts', 'Payouts'],
] as const;
export type DeskFilter = typeof deskFilters[number][0];

export function deskFilter(value?: string): DeskFilter {
  return deskFilters.find(([key]) => key === value)?.[0] ?? 'all';
}

export function deskHref(item?: string, filter: DeskFilter = 'all', returnTo?: string) {
  const params = new URLSearchParams();
  if (item) params.set('item', item);
  if (filter !== 'all') params.set('filter', filter);
  if (returnTo) params.set('returnTo', returnTo);
  return '/admin/sellers/desk' + (params.size ? '?' + params : '');
}

export function visibleDeskItems(items: SellerDeskItem[], filter: DeskFilter) {
  return filter === 'all' ? items : items.filter(item => item.group === filter);
}

export function deskShortcut(event: Pick<KeyboardEvent, 'target'|'key'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'|'repeat'|'isComposing'|'defaultPrevented'>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || event.isComposing) return null;
  const target = event.target as Element | null;
  if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="combobox"], [role="menu"]')) return null;
  const key = event.key.toLowerCase();
  return ['j','k','a','c'].includes(key) ? key : null;
}

export function deskAge(start: number, now: number) {
  const hours = Math.max(0, Math.floor((now - start) / 3_600_000));
  if (!hours) return 'under 1 hour';
  if (hours < 24) return hours + (hours === 1 ? ' hour' : ' hours');
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? ' day' : ' days');
}
