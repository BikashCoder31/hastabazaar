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
  // The V8 test and the T33 bootstrap plan recorded these hashes before the current generator output.
  assertSha256(v8, '7827e2ab78c852a53d9fffa76aa7e91ca4530b88a0ea82378d9a3153a255be6e', 'V8 schema');
  assertSha256(accepted156, 'eda83b438b617d1ef97e3d9fcbdf42bc30613995c0dd4adcc2e1f7905b618c52', 'Accepted 156 schema');
  assertSha256(reset156, 'f71cbde53af46afe3156b2d4df3391c11a1c47590360c23faa41c0ea8b1ffdd3', 'Historical 156 reset source');

  return { candidate, v8, accepted156, reset156 };
}
