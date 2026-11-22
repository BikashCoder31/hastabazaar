import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const demoOrigin = 'https://demo.nepalcanmove.com';
// The status field is printed. Accept documented labels only, never arbitrary provider text.
const documentedStatuses = new Set([
  'Pickup Order Created', 'Drop off Order Created', 'Sent for Pickup', 'Pickup Complete',
  'Drop off Order Collected', 'Dispatched', 'In Transit', 'Arrived', 'Sent for Delivery', 'Delivered',
  'Order Marked Return', 'Send to Vendor', 'Sent to Vendor', 'RTV Delivered', 'Refund Initiated',
]);
const usage = 'Usage: node scripts/check-ncm-demo-status.mjs --order-id <NCM order ID> --vref-id <vendor reference>';

function readArguments(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: {
      'order-id': { type: 'string', multiple: true },
      'vref-id': { type: 'string', multiple: true },
    } }));
  } catch {
    throw new Error(usage);
  }
  const orderIds = values['order-id'] ?? [];
  const refs = values['vref-id'] ?? [];
  if (orderIds.length !== 1 || refs.length !== 1 || !/^[1-9]\d*$/.test(orderIds[0])
      || !Number.isSafeInteger(Number(orderIds[0])) || !refs[0].trim() || Array.from(refs[0]).length > 20) {
    throw new Error(usage);
  }
  return { orderId: orderIds[0], vrefId: refs[0] };
}

async function getDemoJson(path, token, stage, fetchImpl) {
  try {
    const response = await fetchImpl(demoOrigin + path, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Token ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 200) return await response.json();
  } catch {
    // Network and decoding errors can contain URLs, order details or credentials.
  }
  throw new Error('Could not read the NCM demo ' + stage + '.');
}

function matchesOrderId(value, orderId) {
  return value === orderId || value === Number(orderId);
}

function displayStatus(status) {
  if (documentedStatuses.has(status)) return status;
  if (/^Arrived at \S[^\r\n]*$/.test(status)) return 'Arrived';
  if (/^Dispatched to \S[^\r\n]*$/.test(status)) return 'Dispatched';
  return null;
}

function instant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d{1,9}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) return null;
  const [, date, time, fraction = '', zone] = match;
  const midnight = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(midnight.getTime()) || !midnight.toISOString().startsWith(date + 'T')) return null;
  // Compare whole instants including the provider's fractional seconds and UTC offset.
  const milliseconds = Date.parse(date + 'T' + time + zone);
  return BigInt(milliseconds) * BigInt(1_000_000) + BigInt(fraction.padEnd(9, '0'));
}

/**
 * @param {string[]} args
 * @param {Record<string, string | undefined>} env
 * @param {typeof globalThis.fetch} fetchImpl
 */
export async function checkNcmDemoStatus(args, env = process.env, fetchImpl = globalThis.fetch) {
  if (env.HASTABAZAAR_RUNTIME_ENV !== 'test') throw new Error('This command requires HASTABAZAAR_RUNTIME_ENV=test.');
  const token = env.NCM_DEMO_API_TOKEN;
  if (typeof token !== 'string' || !/^[a-f0-9]{40}$/i.test(token)) {
    throw new Error('A valid NCM_DEMO_API_TOKEN must be set in the environment.');
  }
  const { orderId, vrefId } = readArguments(args);
  const label = await getDemoJson('/api/v2/vendor/order/label/' + orderId, token, 'vendor label', fetchImpl);
  if (!matchesOrderId(label?.orderid, orderId) || label?.description?.vendor_orderid !== vrefId) {
    throw new Error('The NCM demo label does not match the supplied order and vendor reference.');
  }

  const history = await getDemoJson('/api/v1/order/status?id=' + orderId, token, 'status history', fetchImpl);
  const invalidHistory = 'The NCM demo status history could not confirm this order.';
  if (!Array.isArray(history) || history.length === 0) throw new Error(invalidHistory);
  let previousInstant = null;
  for (const row of history) {
    const time = instant(row?.added_time);
    if (!matchesOrderId(row?.orderid, orderId) || typeof row?.status !== 'string' || !row.status.trim() || time === null
        || (previousInstant !== null && time > previousInstant)) {
      throw new Error(invalidHistory);
    }
    previousInstant = time;
  }
  const status = displayStatus(history[0].status);
  if (!status) throw new Error(invalidHistory);
  return { orderId, status, addedTime: history[0].added_time };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await checkNcmDemoStatus(process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
