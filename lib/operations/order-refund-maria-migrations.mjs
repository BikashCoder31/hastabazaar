import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { schemaTokens } from './sql-schema-inventory.mjs';

// Fresh and populated fixtures must apply this same order after the reviewed predecessors.
const migrationNames = [
  'mariadb-order-item-pricing-snapshots.sql',
  'mariadb-seller-shipment-delivery-allocations.sql',
  'mariadb-priced-return-effects.sql',
  'mariadb-seller-dispatch-evidence.sql',
  'mariadb-refund-route-reservations.sql',
  'mariadb-priced-order-acceptance-lock.sql',
];

const reservationView = 'refund_route_bank_terminal_evidence';
const viewDeclaration = `CREATE VIEW IF NOT EXISTS ${reservationView}`;
const viewProjection = 'AS SELECT p.id AS packet_id, p.obligation_id, e.id AS event_id FROM';
export const orderRefundSchemaMarker = '\n-- Prospective order pricing and refund route migrations.\n';

export async function resolveOrderRefundScratchOutput(projectRoot, output) {
  const path = resolve(output);
  const target = resolve(await realpath(dirname(path)), basename(path));
  const checkoutRelative = relative(await realpath(projectRoot), target);
  if (checkoutRelative !== '..' && !checkoutRelative.startsWith(`..${sep}`) && !isAbsolute(checkoutRelative)) {
    throw new Error('The order and refund migration output must be a new scratch path outside the checkout.');
  }
  return target;
}

export async function readOrderRefundMariaMigrations(projectRoot) {
  const assets = new Map(await Promise.all(migrationNames.map(async (name) => [
    name, await readFile(resolve(projectRoot, 'deployment/babal', name)),
  ])));
  const reservationSql = assets.get('mariadb-refund-route-reservations.sql').toString('utf8');
  const tokens = schemaTokens(reservationSql);
  const declaration = schemaTokens(viewDeclaration);
  const projection = schemaTokens(viewProjection);
  const matches = (index, expected) => expected.every((token, offset) => {
    const candidate = tokens[index + offset];
    return candidate?.kind === token.kind && candidate.value.toLowerCase() === token.value.toLowerCase();
  });
  const declarations = tokens.flatMap((_, index) => matches(index, declaration) ? [index] : []);
  if (declarations.length !== 1 || !matches(declarations[0] + declaration.length, projection)) {
    throw new Error(`Review the source inventory for ${reservationView} against its changed definition.`);
  }

  return {
    assets,
    suffix: orderRefundSchemaMarker +
      Array.from(assets.values(), (bytes) => bytes.toString('utf8').replaceAll('\r\n', '\n')).join('\n'),
    requiredViews: { [reservationView]: ['event_id', 'obligation_id', 'packet_id'] },
  };
}

export function verifyOrderRefundMariaSchema(schema, historicalPrefixSha, historicalCompanions, suffix) {
  const tail = historicalCompanions.map((bytes) => '\n' + bytes.toString('utf8').replaceAll('\r\n', '\n')).join('') + suffix;
  if (!schema.endsWith(tail)) {
    throw new Error('The selected MariaDB schema does not match the order and refund migration sources.');
  }
  const prefix = schema.slice(0, -tail.length);
  if (createHash('sha256').update(prefix).digest('hex') !== historicalPrefixSha) {
    throw new Error('The selected MariaDB schema does not match the reviewed historical schema.');
  }
}
