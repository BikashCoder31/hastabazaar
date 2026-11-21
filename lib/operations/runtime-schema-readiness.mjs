import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sameCoreStorageDefinition } from '../forms/core-readiness.mjs';

// Each of these features has runtime storage guards. Their SQL is read as text
// so the preview can validate either storage state without applying an upgrade.
const optionalMigrations = new Set([
  '0164_customer_cod_confirmation.sql',
  '0165_delivery_failure_reasons.sql',
  '0166_seller_staff_notes.sql',
  '0167_cancellation_cause.sql',
  '0168_packed_parcel_weight.sql',
]);
const schemaQuery = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name`;
const schemaKey = row => `${row.type}:${row.name}`;
const sameObject = (found, expected) => found?.tbl_name === expected.tbl_name
  && (found.sql === expected.sql || sameCoreStorageDefinition(found.sql, expected.sql));

function withAddedColumn(tableSql, column) {
  // SQLite places added columns before table-level constraints in sqlite_master.
  let depth = 0;
  for (const match of tableSql.matchAll(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|[(),]/g)) {
    const [token] = match;
    const index = match.index;
    if (token === '(') depth++;
    if (token === ')') depth--;
    const beforeConstraint = token === ',' && depth === 1
      && /^\s*(?:CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\s*\(|CHECK\s*\()/i.test(tableSql.slice(index + 1));
    if (beforeConstraint || (token === ')' && depth === 0)) {
      return `${tableSql.slice(0, index)}, ${column}${tableSql.slice(index)}`;
    }
  }
  throw new Error('Cannot locate the end of the columns in the reviewed table');
}

function optionalDefinitions(source, baseline) {
  const changes = new Map();
  for (const part of source.sql.split('--> statement-breakpoint')) {
    const sql = part.replace(/^(?:\s|--[^\n]*(?:\n|$))+/, '').trim().replace(/;$/, '');
    const addedColumn = /^ALTER TABLE (\w+) ADD COLUMN ([\s\S]+)$/i.exec(sql);
    if (addedColumn) {
      const [, name, column] = addedColumn;
      const key = `table:${name}`;
      const original = changes.get(key) ?? baseline.get(key);
      if (!original) throw new Error(`Cannot review added storage for ${name}`);
      changes.set(key, { ...original, sql: withAddedColumn(original.sql, column) });
      continue;
    }

    const created = /^(CREATE (?:UNIQUE )?(TABLE|INDEX|TRIGGER)) (?:IF NOT EXISTS )?(\w+)([\s\S]*)$/i.exec(sql);
    if (!created) continue;
    const [, command, kind, sourceName, definition] = created;
    const type = kind.toLowerCase();
    // The COD migration swaps this staging table into the existing name.
    const name = sourceName === 'first_cod_reviews_0164' ? 'first_cod_reviews' : sourceName;
    const tbl_name = type === 'table' ? name : /\bON\s+(\w+)/i.exec(definition)?.[1];
    if (!tbl_name) throw new Error(`Cannot find the parent table for ${sourceName}`);
    const row = { type, name, tbl_name, sql: `${command} ${name}${definition}` };
    const key = schemaKey(row);
    if (!sameObject(baseline.get(key), row)) changes.set(key, row);
  }
  if (changes.size === 0) throw new Error(`No optional schema changes found in ${source.name}`);
  return changes;
}

let cached;
function currentSchemaReference() {
  const directory = new URL('../../drizzle/', import.meta.url);
  const requiredNames = readdirSync(directory)
    .filter(name => /^\d{4}_.+\.sql$/.test(name) && !optionalMigrations.has(name)).sort();
  const optionalNames = [...optionalMigrations].filter(name => existsSync(new URL(name, directory)));
  const read = name => ({ name, sql: readFileSync(new URL(name, directory), 'utf8') });
  const required = requiredNames.map(read);
  const optional = optionalNames.map(read);
  const digest = createHash('sha256').update(JSON.stringify([...required, ...optional])).digest('hex');
  if (cached?.digest === digest) return cached;

  // As before, model mandatory historical DDL in disposable memory only.
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec('PRAGMA foreign_keys=ON');
    for (const source of required) reference.exec(source.sql);
    const baseline = new Map(reference.prepare(schemaQuery).all().map(row => [schemaKey(row), row]));
    cached = { digest, baseline, optional: optional.map(source => optionalDefinitions(source, baseline)) };
    return cached;
  } finally {
    reference.close();
  }
}

/** Read-only comparison. Optional features must be wholly present or absent. */
export function inspectCurrentRuntimeSchema(sqlite) {
  const reference = currentSchemaReference();
  const actual = new Map(sqlite.prepare(schemaQuery).all().map(row => [schemaKey(row), row]));
  const expected = new Map(reference.baseline);
  for (const changes of reference.optional) {
    const started = [...changes].some(([key]) => {
      const found = actual.get(key);
      const original = reference.baseline.get(key);
      return found && (!original || !sameObject(found, original));
    });
    if (started) for (const [key, row] of changes) expected.set(key, row);
  }

  const missing = [];
  const changed = [];
  for (const [key, row] of expected) {
    const found = actual.get(key);
    if (!found) missing.push(key);
    else if (!sameObject(found, row)) changed.push(key);
  }
  return { ready: missing.length === 0 && changed.length === 0,
    sourceDigest: reference.digest, expectedObjects: expected.size, missing, changed };
}
