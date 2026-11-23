import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '../..');
const foreignKeyFooter = Buffer.from('SET FOREIGN_KEY_CHECKS = 1;\n');

async function readCompanion(name: string) {
  const source = await readFile(resolve(projectRoot, 'deployment/babal', name), 'utf8');
  return source.trim().replaceAll('\r\n', '\n').replace(/[ \t]+$/gm, '') + '\n';
}

function assertSha256(bytes: Buffer, expected: string, description: string) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, description);
}

export async function readHistoricalMariaDbSchema(directory: string) {
  const [candidate, reset156, priceHistory, formHealth] = await Promise.all([
    readFile(resolve(directory, 'mariadb-schema.sql')),
    readFile(resolve(directory, 'mariadb-reset-empty-import.sql')),
    readCompanion('mariadb-product-orderable-price-history.sql'),
    readCompanion('mariadb-native-form-health.sql'),
  ]);
  // These two companions immediately precede the original FK footer in the generated source.
  const additions = Buffer.from(priceHistory + formHealth);
  const historicalEnd = Buffer.concat([additions, foreignKeyFooter]);
  const appendOffset = candidate.indexOf(historicalEnd);
  assert.notEqual(appendOffset, -1, 'Historical price, form health and FK footer must occur together');

  const v8 = Buffer.concat([candidate.subarray(0, appendOffset), foreignKeyFooter]);
  const accepted156 = candidate.subarray(0, appendOffset + historicalEnd.length);
  // Regenerated from the reviewed historical sources with only the position 64 index correction.
  assertSha256(v8, 'd9983289f020a46be10e2297af1ea993a7c596a65d71a26b4a176015d4e64b3b', 'V8 schema');
  assertSha256(accepted156, 'f12537f2e474be0847a41e95710277cd4aa178574193ea6e58b4ae2c57ebe788', 'Accepted 156 schema');
  assertSha256(reset156, 'f575e17652a0299c38ee08f97af1c579b95caf53f223bf958eb384a52cf1a3ab', 'Historical 156 reset source');

  return { candidate, v8, accepted156, reset156 };
}
