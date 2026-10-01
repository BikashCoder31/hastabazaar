import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const required = [
  'app.cjs', 'server.js', 'package.json',
  'deployment/babal/release-manifest.json',
  'dist/client/vinext-client-entry-manifest.json',
];

export function assertReleasePath(path) {
  if (typeof path !== 'string' || !path || /[\\:]/.test(path) ||
      Array.from(path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid release path: ${JSON.stringify(path)}`);
  }
  if (/(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|\.ssh|\.aws|id_rsa|id_ed25519|private-media|uploads|\.staging|\.git|deployment-backups|backups?|seeds)(\/|$)/i.test(path) ||
      /\.(?:key|pem|p12|pfx|sqlite(?:3)?(?:-wal|-shm)?|db(?:-wal|-shm)?|zip|tar|tgz|gz|log)$/i.test(path) ||
      path.toLowerCase() === 'deployment/babal/mariadb-reset-empty-import.sql' ||
      (/\.sql$/i.test(path) && !/^deployment\/babal\/(?:migrations\/)?[a-z0-9._-]+\.sql$/.test(path))) {
    throw new Error(`Forbidden release file: ${path}`);
  }
}

export async function inventoryRelease(root, allowedSqlPaths = []) {
  const allowedSql = new Set(allowedSqlPaths);
  const files = [];
  if (!(await lstat(root)).isDirectory()) throw new Error('Release root must be a real directory.');
  async function visit(directory, prefix = '') {
    for (const name of await readdir(directory)) {
      const path = prefix + name;
      assertReleasePath(path);
      if (/\.sql$/i.test(path) && !allowedSql.has(path)) throw new Error(`Forbidden unapproved SQL file: ${path}`);
      const absolute = join(directory, name);
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Release links are forbidden: ${path}`);
      if (stat.isDirectory()) await visit(absolute, `${path}/`);
      else if (stat.isFile()) files.push({
        path, bytes: stat.size,
        sha256: createHash('sha256').update(await readFile(absolute)).digest('hex'),
      });
      else throw new Error(`Unsupported release file: ${path}`);
    }
  }
  await visit(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function verifyRelease(root, expected, allowedSqlPaths = []) {
  if (!Array.isArray(expected) || !expected.length) throw new Error('Release inventory is required.');
  const names = new Set();
  const byPath = new Map();
  for (const file of expected) {
    assertReleasePath(file.path);
    if (names.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid release inventory entry.');
    names.add(file.path);
    byPath.set(file.path, file);
  }
  for (const name of required) if (!names.has(name)) throw new Error(`Missing required release file: ${name}`);
  const actual = await inventoryRelease(root, allowedSqlPaths);
  if (actual.length !== expected.length || actual.some((file) => {
    const record = byPath.get(file.path);
    return !record || record.bytes !== file.bytes || record.sha256 !== file.sha256;
  })) throw new Error('Release inventory mismatch.');
  return actual;
}
