import { MAX_CART_LINES } from '../cart/storage';
import { normalizeDistrict } from '../checkout/nepal-address';
import type { NcmDemoDeliveryQuote } from '../checkout/reviewed-quote';

export const NCM_DEMO_SERVICE = 'Pickup/Collect';

type PickupBranch = { branch: string; updatedAt: number };

export class NcmDemoQuoteError extends Error {}

export function ncmDemoCheckout(runtime: unknown) {
  if (!runtime || typeof runtime !== 'object') return undefined;
  const bindings = runtime as { HASTABAZAAR_RUNTIME_ENV?: string; NCM_DEMO_API_TOKEN?: string; NCM_DEMO_PICKUP_BRANCHES?: string };
  const token = bindings.NCM_DEMO_API_TOKEN;
  if (bindings.HASTABAZAAR_RUNTIME_ENV !== 'test' || typeof token !== 'string' || !/^[A-Fa-f0-9]{40}$/.test(token))
    return undefined;
  const assignments = demoPickupBranches(bindings.NCM_DEMO_PICKUP_BRANCHES);
  return {
    quote: (db: D1Database, sellerIds: readonly string[], district: string) =>
      quoteDelivery(db, token, assignments, sellerIds, district),
  };
}

export type NcmDemoCheckout = NonNullable<ReturnType<typeof ncmDemoCheckout>>;

export function createNcmDemoVendorReference(): string {
  // NCM accepts 20 characters. The shipment allocation's primary key enforces
  // uniqueness and keeps the same reference with the order on retries.
  const random = crypto.getRandomValues(new Uint8Array(9));
  return 'HB' + Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

type PickupAddress = {
  id: string;
  sellerId: string;
  locality: string;
  updatedAt: number;
};

// Demo mapping format: { "pickup-address-id": { "branch": "POKHARA", "updatedAt": 123 } }.
// A saved pickup is free text, so the branch must be assigned to that address revision.
function demoPickupBranches(raw: unknown): ReadonlyMap<string, PickupBranch> {
  const assignments = new Map<string, PickupBranch>();
  if (typeof raw !== 'string') return assignments;
  let configured: unknown;
  try { configured = JSON.parse(raw); } catch { return assignments; }
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return assignments;
  for (const [id, value] of Object.entries(configured)) {
    const entry = value as Partial<PickupBranch> | null;
    if (!id || !entry || typeof entry.branch !== 'string' || !/^[A-Z0-9][A-Z0-9 ]{0,39}$/.test(entry.branch) ||
      typeof entry.updatedAt !== 'number' || !Number.isSafeInteger(entry.updatedAt) || entry.updatedAt < 0) continue;
    assignments.set(id, { branch: entry.branch, updatedAt: entry.updatedAt });
  }
  return assignments;
}

async function quoteDelivery(db: D1Database, token: string, assignments: ReadonlyMap<string, PickupBranch>, sellerIds: readonly string[], district: string) {
  if (normalizeDistrict(district) !== 'Kathmandu')
    throw new NcmDemoQuoteError('NCM demo checkout requires a Kathmandu delivery address.');
  const destinationBranch = 'TINKUNE';
  const ids = [...new Set(sellerIds)].sort((a, b) => a.localeCompare(b));
  if (!ids.length || ids.length > MAX_CART_LINES)
    throw new NcmDemoQuoteError('Review your cart before requesting NCM demo quotes.');
  const pickup = await db.prepare(`SELECT id,seller_id AS sellerId,locality,updated_at AS updatedAt
    FROM seller_operational_addresses WHERE purpose='pickup' AND seller_id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).all<PickupAddress>();
  const addresses = new Map(pickup.results.map(address => [address.sellerId, address]));
  const routes = ids.map(sellerId => {
    const address = addresses.get(sellerId);
    const assignment = address && assignments.get(address.id);
    if (!address || !address.locality.trim() || !assignment || assignment.updatedAt !== address.updatedAt)
      throw new NcmDemoQuoteError('A seller’s current pickup address needs an NCM demo branch assignment.');
    return { address, originBranch: assignment.branch };
  });
  const branches = new Set(routes.map(route => route.originBranch));
  const charges = new Map(await Promise.all([...branches].map(async branch =>
    [branch, await getDemoCharge(token, branch, destinationBranch)] as const)));
  const quotes: NcmDemoDeliveryQuote[] = routes.map(({ address, originBranch }) => ({
    sellerId: address.sellerId, originBranch, destinationBranch, amountPaisa: charges.get(originBranch)!,
  }));
  return {
    quotes,
    deliveryPaisa: quotes.reduce((sum, quote) => sum + quote.amountPaisa, 0),
    pickup: routes.map(route => route.address),
  };
}

async function getDemoCharge(token: string, originBranch: string, destinationBranch: string): Promise<number> {
  const url = new URL('https://demo.nepalcanmove.com/api/v1/shipping-rate');
  url.search = new URLSearchParams({ creation: originBranch, destination: destinationBranch, type: NCM_DEMO_SERVICE }).toString();
  try {
    const response = await fetch(url, {
      method: 'GET', headers: { Accept: 'application/json', Authorization: 'Token ' + token },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('NCM demo rate request failed.');
    const payload = await response.json() as { charge?: unknown };
    const charge = payload?.charge;
    const match = (typeof charge === 'string' || typeof charge === 'number') && /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(charge));
    if (!match) throw new Error('NCM demo returned an invalid rate.');
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  } catch {
    throw new NcmDemoQuoteError(`NCM demo could not quote ${originBranch} to ${destinationBranch}. Review delivery before placing the order.`);
  }
}
