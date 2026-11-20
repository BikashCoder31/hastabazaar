import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {assertSelectedConstraints, digest, selectedSchemaSha256} from '../testing/current-artifact-identity.mjs';
import {sqlStatements} from '../testing/verify-current-native.mjs';

const baselines = new WeakMap();
const browserBaselines = new WeakMap();
const viewName = '[a-z_][a-z0-9_]*';
const createView = new RegExp('^CREATE (?:OR REPLACE )?VIEW ('+viewName+') AS\\s');
const dropView = new RegExp('^DROP VIEW ('+viewName+')$');

// This reads the CREATE/DROP history in the one admitted bootstrap. It is
// intentionally limited to the statement forms used by those pinned bytes.
export function selectedViewPlan(selected) {
  assert.equal(digest(selected.schema), selectedSchemaSha256);
  const statements = sqlStatements(selected.schema.toString('utf8'));
  const names = new Set();
  for (const sql of statements) {
    const statement = sql.trim().replace(/^(?:--[^\n]*\n\s*)+/, '');
    const create = createView.exec(statement);
    const drop = dropView.exec(statement);
    if (create) names.add(create[1]);
    if (drop) assert.ok(names.delete(drop[1]), 'Selected bootstrap drops an unexpected view');
  }
  assert.equal(names.size, 12, 'Selected bootstrap view count changed');
  return {statements, names: [...names].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)};
}

// Track SELECT and relation lists at each parenthesis depth. FROM within a
// scalar expression (for example EXTRACT) does not open a relation list.
export function normalizeSelectedView(sql, database) {
  const marker = '`$database`';
  assert.ok(typeof sql === 'string', 'Invalid selected view definition');
  const pattern = /'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|--(?=\s|$)[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\/|`(?:``|[^`])*`|[\p{L}\p{N}_$]+|[^\s]/gu;
  const tokens = [...sql.matchAll(pattern)].filter(([raw]) => {
    assert.notEqual(raw, marker, 'Reserved selected view identifier');
    assert.ok(!/^\/\*(?:!|M!)/i.test(raw), 'Unsupported executable selected view token');
    return !/^(?:--|#|\/\*)/.test(raw);
  });
  const isIdentifier = token => /^(?:`(?:``|[^`])+`|[\p{L}\p{N}_$]+)$/u.test(token ?? '');
  const scopes = [{select:false, from:false, relation:false}];
  let normalized = '', start = 0, queryBody = false;
  for (let index = 0; index < tokens.length; index++) {
    const [raw] = tokens[index];
    const keyword = raw.toUpperCase();
    const scope = scopes.at(-1);
    const next = tokens[index+1]?.[0];
    const relation = scope.relation;
    assert.ok(!/^['"`]$/.test(raw) && !(raw === '/' && next === '*'), 'Unsupported selected view token');

    assert.ok(!(raw.startsWith('"') && (next === '.' || tokens[index-1]?.[0] === '.')),
      'Ambiguous quoted selected view identifier');

    if (raw === '(') {
      const group = scope.relation && next?.toUpperCase() !== 'SELECT';
      scope.relation = false;
      scopes.push({select:false, from:group, relation:group});
    } else if (raw === ')') {
      assert.ok(scopes.length > 1 && !scope.relation, 'Unsupported selected view parentheses');
      scopes.pop();
    } else if (scope.relation) {
      assert.ok(isIdentifier(raw) && keyword !== 'WITH', 'Unsupported selected view relation');
      scope.relation = false;
      if (next === '.') {
        assert.ok(isIdentifier(tokens[index+2]?.[0]) && tokens[index+3]?.[0] !== '.', 'Unsupported qualified selected view relation');
      }
    } else if (keyword === 'SELECT') {
      queryBody = scope.select = true;
      scope.from = false;
    } else if (keyword === 'FROM' && scope.select) {
      assert.ok(!scope.from, 'Ambiguous selected view FROM');
      scope.from = scope.relation = true;
      continue;
    } else if (scope.from && ['JOIN','STRAIGHT_JOIN',','].includes(keyword)) {
      scope.relation = true;
      continue;
    } else if (['WHERE','GROUP','HAVING','ORDER','LIMIT','WINDOW','UNION','INTERSECT','EXCEPT','INTO','FOR','LOCK'].includes(keyword)) {
      scope.from = false;
      scope.select = false;
    }

    if (!isIdentifier(raw) || next !== '.' || !isIdentifier(tokens[index+2]?.[0])) continue;
    const third = tokens[index+3]?.[0];
    assert.notEqual(third, '(', 'Schema-qualified selected view routine is forbidden');
    if (!relation && third !== '.') continue; // alias.column or alias.*
    if (third === '.') {
      const column = tokens[index+4]?.[0];
      assert.ok(queryBody && (column === '*' || isIdentifier(column)) &&
        !['.','('].includes(tokens[index+5]?.[0]), 'Unsupported qualified selected view column');
    }
    assert.ok(raw === database || raw === '`'+database+'`', 'Cross-schema selected view reference');
    normalized += sql.slice(start, tokens[index].index) + marker;
    start = tokens[index].index + raw.length;
    index += third === '.' ? 4 : 2;
  }
  assert.ok(scopes.length === 1 && !scopes[0].relation, 'Incomplete selected view relation');
  return normalized + sql.slice(start);
}

async function readDefinitions(connection, database, names) {
  const [identity] = await connection.query('SELECT CURRENT_USER() definer');
  assert.equal(identity.length, 1, 'Selected view definer identity is unavailable');
  const [metadata] = await connection.query("SELECT TABLE_NAME name, DEFINER definer, SECURITY_TYPE securityType, CHECK_OPTION checkOption, IS_UPDATABLE updatable FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() ORDER BY BINARY TABLE_NAME");
  assert.deepEqual(metadata.map(row => row.name), names, 'Selected native view set differs from the bootstrap');
  const definitions = [];
  for (const row of metadata) {
    assert.ok(row.definer === identity[0].definer && row.securityType === 'DEFINER', 'Unexpected selected native view definer or security mode');
    const [values] = await connection.query('SHOW CREATE VIEW `'+row.name+'`');
    assert.equal(values.length, 1, 'Selected native view definition is unavailable');
    const value = values[0];
    assert.ok(typeof value.character_set_client === 'string' && typeof value.collation_connection === 'string', 'Selected native view character metadata is unavailable');
    definitions.push({
      view:row.name, sql:normalizeSelectedView(value['Create View'], database),
      characterSet:value.character_set_client, collation:value.collation_connection,
      definer:row.definer, securityType:row.securityType, checkOption:row.checkOption, updatable:row.updatable,
    });
  }
  return definitions;
}

export async function initializeSelectedFixture({ query, database, statements, onCreate = () => {} }) {
  assert.match(database, /^native_\d+_fresh$/);
  // A duplicate schema must stop before any bootstrap statement runs.
  await query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  onCreate();
  await query('USE `'+database+'`');
  for (const sql of statements) await query(sql);
  assert.equal((await query('SELECT @@collation_database value'))[0][0].value, 'utf8mb4_unicode_ci');
}

async function viewConnectionIdentity(query) {
  const [rows] = await query('SELECT DATABASE() name, CONNECTION_ID() connectionId, @@hostname host, @@port port, @@server_id serverId, CURRENT_USER() definer');
  assert.equal(rows.length, 1, 'Selected view connection identity is unavailable');
  const {name, connectionId, ...server} = rows[0];
  assert.ok(Number.isSafeInteger(connectionId) && connectionId > 0 && typeof server.host === 'string' && server.host &&
    Number.isSafeInteger(server.port) && Number.isSafeInteger(server.serverId) && typeof server.definer === 'string' && server.definer,
  'Invalid selected view connection identity');
  return {name, connectionId, server};
}

/** The browser owns a different socket from the recovery parent. Derive an independent
 * baseline from the same pinned SQL in a new schema on its attested disposable server. */
export async function bindSelectedBrowserViews({connection, openReference, database, selected, assertOwned, signal}) {
  assert.match(database, /^native_\d+_fresh$/);
  const {statements, names} = selectedViewPlan(selected);
  const originalConnection = connection.connection;
  assert.ok(originalConnection && typeof originalConnection === 'object', 'Owned selected browser connection required');
  await assertOwned();
  signal.throwIfAborted();
  const sourceIdentity = await viewConnectionIdentity(sql => connection.query(sql));
  assert.equal(sourceIdentity.name, database, 'Unexpected selected browser database');

  const scratch = 'native_' + BigInt('0x' + randomBytes(12).toString('hex')) + '_fresh';
  assert.notEqual(scratch, database);
  const reference = await openReference();
  assert.ok(reference.connection && reference.connection !== originalConnection, 'Selected view reference requires a separate connection');
  const rawReferenceQuery = sql => reference.query({sql, timeout:30000});
  let referenceIdentity;
  let created = false;
  async function closeReference() {
    try {
      if (created) {
        // A cancellation still closes the exact scratch schema if ownership is current.
        await assertOwned();
        const {name, ...actual} = await viewConnectionIdentity(rawReferenceQuery);
        assert.ok(name === scratch || name === database, 'Unexpected selected view reference database during cleanup');
        assert.deepEqual(actual, {connectionId:referenceIdentity.connectionId, server:sourceIdentity.server});
        await rawReferenceQuery('DROP DATABASE `'+scratch+'`');
      }
    } finally {
      await reference.end();
    }
  }
  let definitionHash;
  try {
    referenceIdentity = await viewConnectionIdentity(rawReferenceQuery);
    assert.equal(referenceIdentity.name, database, 'Unexpected selected view reference database');
    assert.notEqual(referenceIdentity.connectionId, sourceIdentity.connectionId, 'Selected view reference requires a separate connection');
    assert.deepEqual(referenceIdentity.server, sourceIdentity.server, 'Selected view reference uses a different server or account');
    const query = sql => {
      signal.throwIfAborted();
      return rawReferenceQuery(sql);
    };
    await initializeSelectedFixture({query, database:scratch, statements, onCreate:() => { created = true; }});
    assert.deepEqual(await viewConnectionIdentity(query), {...referenceIdentity, name:scratch}, 'Selected view reference switched connection or schema');
    await assertSelectedConstraints({query}, selected.manifest);
    definitionHash = digest(JSON.stringify(await readDefinitions({query}, scratch, names)));
    signal.throwIfAborted();
  } catch (error) {
    try { await closeReference(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Selected browser view baseline and fixture cleanup failed'); }
    throw error;
  }
  await closeReference();
  signal.throwIfAborted();
  assert.deepEqual(await viewConnectionIdentity(sql => connection.query(sql)), sourceIdentity, 'Selected browser connection changed during view admission');
  const baseline = Object.freeze({sha256:definitionHash, count:names.length});
  browserBaselines.set(baseline, {originalConnection, database, names, receipt:baseline, sourceIdentity});
  await verifySelectedRecoveryViews(connection, database, database, names, baseline);
  return Object.freeze({baseline, database});
}

// The only receipt issuance path creates a new owned schema and imports the
// exact pinned bytes on the same socket before any workflow child can use it.
export async function importSelectedRecoveryFixture({connection, database, containerId, selected, archiveSha256, owned, cancellation}) {
  const originalConnection = connection.connection;
  assert.ok(originalConnection && typeof originalConnection === 'object', 'Owned selected bootstrap connection required');
  assert.match(containerId, /^[a-f0-9]{64}$/);
  assert.match(archiveSha256, /^[a-f0-9]{64}$/);
  assert.match(selected.manifestSha256, /^[a-f0-9]{64}$/);
  const manifestSha256 = selected.manifestSha256;
  const {statements, names} = selectedViewPlan(selected);
  await owned();
  // Use the runner's existing owned wrapper, including its watchdog and failure state.
  const query = async sql => {
    await cancellation.checkpoint();
    return connection.query({sql, timeout:30000});
  };
  await initializeSelectedFixture({query, database, statements});
  const [identity] = await query('SELECT DATABASE() name');
  assert.equal(identity[0]?.name, database, 'Unexpected selected view baseline database');
  const definitions = await readDefinitions({query}, database, names);
  const receipt = Object.freeze({sha256:digest(JSON.stringify(definitions)), count:names.length});
  baselines.set(receipt, {originalConnection, database, containerId, archiveSha256, manifestSha256, names, receipt, schemaSha256:selectedSchemaSha256});
  return receipt;
}

export function assertSelectedRecoveryViewBinding(baseline, {connection, database, containerId, selected, archiveSha256}) {
  const saved = baselines.get(baseline);
  assert.ok(saved && saved.originalConnection === connection.connection && saved.database === database &&
    saved.containerId === containerId && saved.archiveSha256 === archiveSha256 &&
    saved.manifestSha256 === selected.manifestSha256 && saved.schemaSha256 === digest(selected.schema),
    'Selected recovery requires the owned fresh bootstrap view baseline');
}

export async function verifySelectedRecoveryViews(connection, database, expectedDatabase, names, baseline) {
  const browser = browserBaselines.get(baseline);
  const saved = browser ?? baselines.get(baseline);
  assert.ok(saved && database === expectedDatabase && (database === saved.database ||
    !browser && database === saved.database.replace(/_fresh$/, '_recovery')), 'Unexpected selected view inventory database');
  if (database === saved.database) {
    assert.equal(connection.connection, saved.originalConnection, 'Unexpected selected view source connection');
  }
  if (browser) {
    assert.deepEqual(await viewConnectionIdentity(sql => connection.query(sql)), browser.sourceIdentity, 'Selected browser view socket changed');
  }
  assert.deepEqual(names, saved.names, 'Selected native view set differs from the bootstrap');
  const definitions = await readDefinitions(connection, database, names);
  assert.ok(digest(JSON.stringify(definitions)) === saved.receipt.sha256, 'Selected native view definition or metadata differs from the bootstrap');
  return definitions;
}
