export const orderViews = [
  ['all', 'All'],
  ['attention', 'Needs attention'],
  ['new', 'New'],
  ['transit', 'On the way'],
  ['delivered', 'Delivered'],
] as const;

export type OrderView = (typeof orderViews)[number][0];
export type OrderFilters = {
  q?: string;
  status?: string;
  seller?: string;
  view?: OrderView;
};

const moment = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  hour12: true,
  minute: '2-digit',
  timeZone: 'Asia/Kathmandu',
});
const currency = new Intl.NumberFormat('en-NP', {
  style: 'currency',
  currency: 'NPR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const formatOrderTime = (time: number) => moment.format(time);
export const orderMoney = (paisa: number) => currency.format(paisa / 100);
export const orderPaymentMode = (mode: string) =>
  mode === 'cod' ? 'Cash on delivery' : 'Prepaid';

export function orderStage(status: string) {
  const labels: Record<string, string> = {
    pending_payment: 'Awaiting payment',
    awaiting_cod_confirmation: 'Awaiting COD confirmation',
    ready_for_pickup: 'Waiting for pickup',
    dispatched: 'With courier',
    return_in_transit: 'Returning',
    delivery_failed: 'Parcel problem',
  };
  const words = status.replaceAll('_', ' ');
  return labels[status] ?? words.charAt(0).toUpperCase() + words.slice(1);
}

export function orderQueueHref(
  filters: OrderFilters,
  page = 1,
  selection?: string,
) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.seller) params.set('seller', filters.seller);
  if (filters.view && filters.view !== 'all') params.set('view', filters.view);
  if (page > 1) params.set('page', String(page));
  if (selection) params.set('order', selection);
  return '/admin/orders' + (params.size ? '?' + params : '');
}

export function orderDeadline(dueAt: number | null, now: number) {
  if (dueAt === null) return null;
  const remaining = dueAt - now;
  if (remaining > 0) return 'By ' + formatOrderTime(dueAt);
  const hours = Math.floor(-remaining / 3_600_000);
  return hours > 0 ? hours + ' h late' : 'Due now';
}
