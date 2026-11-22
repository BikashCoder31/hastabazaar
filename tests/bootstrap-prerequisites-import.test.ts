import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { sqlStatements } from '../scripts/testing/verify-current-native.mjs';
import { splitFixtureSql } from '../scripts/portable-mariadb-fixture.mjs';
import { readHistoricalMariaDbSchema } from './helpers/historical-mariadb-schema';

void test('actual native importers keep the prerequisite compound block whole and the accepted156 statements exact', async (t) => {
  const root = resolve(import.meta.dirname, '..');
  const directory = await mkdtemp(join(tmpdir(), 'hastabazaar-bootstrap-source-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync(process.execPath, ['scripts/generate-mariadb-schema.mjs', '--output-directory=' + directory], { cwd: root, stdio: 'pipe' });
  const { accepted156 } = await readHistoricalMariaDbSchema(directory);
  const base = new TextDecoder().decode(accepted156);
  const companion = await readFile(resolve(root, 'deployment/babal/mariadb-bootstrap-prerequisites.sql'), 'utf8');

  for (const parse of [sqlStatements, splitFixtureSql]) {
    const one = parse(companion);
    const original = parse(base);
    const combined = parse(base + '\n' + companion);
    assert.equal(one.length, 1, 'No comment-only query or split internal semicolons');
    assert.match(one[0], /^BEGIN NOT ATOMIC/);
    assert.match(one[0], /END IF;/);
    assert.match(one[0], /END$/);
    assert.equal(original.length, 1776);
    assert.equal(combined.length, 1777);
    assert.deepEqual(combined.slice(0, -1), original);
    assert.equal(combined.at(-1), one[0]);
  }
});
