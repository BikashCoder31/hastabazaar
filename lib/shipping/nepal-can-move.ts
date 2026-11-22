import type { Shipment } from './provider';

export const nepalCanMoveIntegration = {
  providerKey: 'nepal_can_move',
  status: 'configuration_required',
} as const;

export const ncmDeliveryTypes = ['Door2Door', 'Branch2Door', 'Door2Branch', 'Branch2Branch'] as const;
export type NcmDeliveryType = typeof ncmDeliveryTypes[number];
const rateTypes: Record<NcmDeliveryType, string> = {
  Door2Door: 'Pickup/Collect', Branch2Door: 'Send', Door2Branch: 'D2B', Branch2Branch: 'B2B',
};
export const ncmFieldLabels = {
  name: 'Receiver name', phone: 'Phone', phone2: 'Second phone', cod_charge: 'Cash to collect',
  address: 'Address', fbranch: 'Pickup branch', branch: 'Destination branch', package: 'Package name',
  vref_id: 'Courier reference', instruction: 'Delivery instructions', delivery_type: 'Delivery type', weight: 'Packed weight',
} as const;
export type NcmOrderInput = {
  name: string; phone: string; cod_charge: string; address: string; fbranch: string; branch: string;
  phone2?: string; package?: string; vref_id?: string; instruction?: string; delivery_type?: NcmDeliveryType; weight?: number;
};
export type NcmBranch = { name: string; district: string; areas: string[] };
type NcmApiBindings = {
  NCM_API_BASE_URL?: string; NCM_API_TOKEN?: string; NCM_DEMO_API_TOKEN?: string; HASTABAZAAR_RUNTIME_ENV?: string;
};
type NcmApiConfiguration = { origin: string; token: string };
const demoOrigin = 'https://demo.nepalcanmove.com';
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function ncmApiConfiguration(runtime: unknown): NcmApiConfiguration | null {
  if (!runtime || typeof runtime !== 'object') return null;
  const bindings = runtime as NcmApiBindings;
  let url: URL;
  try { url = new URL(bindings.NCM_API_BASE_URL ?? ''); } catch { return null; }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  const loopback = loopbackHosts.has(url.hostname);
  const environment = bindings.HASTABAZAAR_RUNTIME_ENV;
  let token: string | undefined;
  if (environment === 'production' && url.protocol === 'https:' && !loopback && url.origin !== demoOrigin) {
    token = bindings.NCM_API_TOKEN;
  } else if ((environment === 'test' || environment === 'local_staging') && loopback && url.protocol === 'http:') {
    token = bindings.NCM_API_TOKEN;
  } else if (environment === 'test' && url.origin === demoOrigin && /^[a-f0-9]{40}$/i.test(bindings.NCM_DEMO_API_TOKEN ?? '')) {
    token = bindings.NCM_DEMO_API_TOKEN;
  }
  return typeof token === 'string' && /^[\x21-\x7e]{1,512}$/.test(token) ? { origin: url.origin, token } : null;
}

export async function ncmConnectionFingerprint(configuration: NcmApiConfiguration) {
  const bytes = new TextEncoder().encode(JSON.stringify([configuration.origin, configuration.token]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class NcmApiError extends Error {
  constructor(
    readonly kind: 'rejected' | 'uncertain',
    message: string,
    readonly fields: Partial<Record<keyof typeof ncmFieldLabels, string>> = {},
  ) { super(message); }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, length: number) =>
  typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, length) : '';

export function ncmOrderId(value: unknown): string | null {
  const id = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  return /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null;
}

export function ncmRupeesToPaisa(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null;
}

function safeFieldErrors(payload: unknown, token: string): NcmApiError['fields'] {
  const entries = record(record(payload).Error);
  const fields: NcmApiError['fields'] = {};
  for (const field of Object.keys(ncmFieldLabels) as (keyof typeof ncmFieldLabels)[]) {
    const value = entries[field];
    const messages = Array.isArray(value) ? value.filter(text => typeof text === 'string').slice(0, 4).join(' ') : value;
    const message = typeof messages === 'string' ? clean(messages.replaceAll(token, '[redacted]'), 300) : '';
    if (message) fields[field] = message;
  }
  return fields;
}

async function json(response: Response): Promise<unknown> {
  const maxBytes = 2 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing NCM response.');
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('NCM response is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

function requireId(value: unknown) {
  const id = ncmOrderId(value);
  if (!id) throw new NcmApiError('rejected', 'Enter a valid NCM order number.');
  return id;
}

export function createNcmClient(configuration: NcmApiConfiguration, fetchImpl: typeof fetch = fetch) {
  const { origin, token } = configuration;
  async function request(path: string, options: { query?: Record<string, string>; body?: object } = {}) {
    const url = new URL(path, origin);
    if (options.query) url.search = new URLSearchParams(options.query).toString();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: options.body ? 'POST' : 'GET',
        headers: { Accept: 'application/json', Authorization: 'Token ' + token,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new NcmApiError('uncertain', 'NCM did not confirm the request.');
    }
    if (response.status === 400) {
      const payload = await json(response).catch(() => null);
      if (!Object.keys(record(record(payload).Error)).length)
        throw new NcmApiError('uncertain', 'NCM did not confirm the request.');
      throw new NcmApiError('rejected', 'NCM rejected the request. Review the details.', safeFieldErrors(payload, token));
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new NcmApiError('uncertain', 'NCM did not confirm the request.');
    }
    try { return await json(response); } catch {
      throw new NcmApiError('uncertain', 'NCM returned an unreadable response.');
    }
  }

  return {
    key: nepalCanMoveIntegration.providerKey,
    async branches(): Promise<NcmBranch[]> {
      const payload = await request('/api/v2/branches');
      if (!Array.isArray(payload)) throw new NcmApiError('uncertain', 'NCM did not return a branch list.');
      const branches = new Map<string, NcmBranch>();
      for (const value of payload) {
        const row = record(value);
        const name = clean(row.name ?? row.branch, 100);
        const areaValues = row.covered_areas;
        const areas = (Array.isArray(areaValues) ? areaValues : typeof areaValues === 'string' ? areaValues.split(',') : [])
          .map(area => clean(area, 120)).filter(Boolean);
        if (name) branches.set(name, { name, district: clean(row.district, 120), areas });
      }
      if (!branches.size) throw new NcmApiError('uncertain', 'NCM did not return recognizable branch names.');
      return [...branches.values()];
    },
    async assignedBranches() {
      const payload = await request('/api/v2/vendor/assigned-branches');
      if (!Array.isArray(payload) || payload.some(name => !clean(name, 100)))
        throw new NcmApiError('uncertain', 'NCM did not return your pickup branches.');
      return [...new Set(payload.map(name => clean(name, 100)))];
    },
    async shippingRate(originBranch: string, destinationBranch: string, type: NcmDeliveryType) {
      const charge = ncmRupeesToPaisa(record(await request('/api/v1/shipping-rate', {
        query: { creation: originBranch, destination: destinationBranch, type: rateTypes[type] },
      })).charge);
      if (charge === null) throw new NcmApiError('uncertain', 'NCM did not return a delivery charge.');
      return charge;
    },
    async createOrder(payload: NcmOrderInput): Promise<Shipment> {
      const id = ncmOrderId(record(await request('/api/v1/order/create', { body: payload })).orderid);
      if (!id) throw new NcmApiError('uncertain', 'NCM did not return an order number.');
      return { provider: nepalCanMoveIntegration.providerKey, providerShipmentId: id, trackingCode: id, status: 'pickup_scheduled' };
    },
    async orderDetails(id: string) {
      return record(await request('/api/v1/order', { query: { id: requireId(id) } }));
    },
    statusHistory: (id: string) => request('/api/v1/order/status', { query: { id: requireId(id) } }),
    async bulkStatuses(ids: string[]) {
      const payload = record(await request('/api/v1/orders/statuses', { body: { orders: ids.map(id => Number(requireId(id))) } }));
      if (!payload.result || typeof payload.result !== 'object' || Array.isArray(payload.result))
        throw new NcmApiError('uncertain', 'NCM did not return the order statuses.');
      const results = record(payload.result);
      const errors = new Set(Array.isArray(payload.errors) ? payload.errors.map(ncmOrderId) : []);
      return new Map(ids.filter(id => !errors.has(id) && typeof results[id] === 'string').map(id => [id, results[id] as string]));
    },
    comments: (id: string) => request('/api/v1/order/comment', { query: { id: requireId(id) } }),
    bulkComments: () => request('/api/v1/order/getbulkcomments'),
    addComment: (id: string, comment: string) => request('/api/v1/comment', { body: { orderid: Number(requireId(id)), comments: comment } }),
    async label(id: string) {
      return record(await request('/api/v2/vendor/order/label/' + requireId(id)));
    },
    bulkLabels: (ids: string[]) => request('/api/v2/vendor/order/label/', { body: { ids: ids.map(id => Number(requireId(id))) } }),
    returnOrder: (id: string, comment: string) => request('/api/v2/vendor/order/return', { body: { pk: Number(requireId(id)), comment } }),
  };
}

export type NcmApiClient = ReturnType<typeof createNcmClient>;
