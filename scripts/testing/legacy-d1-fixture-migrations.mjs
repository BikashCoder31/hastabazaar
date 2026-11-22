import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test-only preload. Legacy fixtures discover their bootstrap files by listing
// drizzle/. Keep the owner-applied migrations readable by explicit path.
const drizzle = fileURLToPath(new URL('../../drizzle', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('../../deployment/babal/release-manifest.json', import.meta.url), 'utf8'));
const ownerApplied = new Set(manifest.ownerAppliedMigrations.map(migration => {
  const match = /^drizzle\/(\d{4}_[a-z0-9_]+\.sql)$/.exec(migration.d1.path);
  if (!match) throw new Error('Invalid owner-applied D1 migration path');
  return match[1];
}));

function fixtureEntries(directory, entries) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  if (Buffer.isBuffer(directory)) directory = directory.toString();
  if (typeof directory !== 'string' || resolve(directory) !== drizzle) return entries;
  return entries.filter(entry => !ownerApplied.has(String(entry.name ?? entry)));
}

const readdirSync = fs.readdirSync;
fs.readdirSync = (directory, ...options) => fixtureEntries(directory, readdirSync(directory, ...options));

const readdirPromise = fsPromises.readdir;
fsPromises.readdir = async (directory, ...options) => fixtureEntries(directory, await readdirPromise(directory, ...options));

const readdir = fs.readdir;
fs.readdir = (directory, ...options) => {
  const callback = options.pop();
  readdir(directory, ...options, (error, entries) => callback(error, error ? entries : fixtureEntries(directory, entries)));
};

syncBuiltinESMExports();
