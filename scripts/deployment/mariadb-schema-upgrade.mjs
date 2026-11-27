import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { convergenceColumns, upgradeCheckpoints } from './mariadb-upgrade-checkpoints.mjs';
import { pricingSchemaFindings, pricingSchemaReportSql, pricingSchemaSql, registeredPricingMigrations } from '../../lib/operations/pricing-schema-readiness.mjs';

const historicalRelease = 'hastabazaar-release-ci-45059021181-1';
const historicalManifestSha = 'ed82aaf857f26100233b83263f2814d11cf52f6a7c576954a8263530c28882cd';
const manifestPath = 'deployment/babal/release-manifest.json';
const convergencePath = 'deployment/babal/mariadb-retained-schema-convergence.sql';
const hex = /^[a-f0-9]{64}$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

export function migrationSteps(manifest, phase) {
  const pricing = registeredPricingMigrations(manifest);
  if (phase === 'pricing') {
    requireThat(pricing.length > 0, 'This release has no verified pricing migration batch');
    return pricing.map((entry, index) => ({ ...entry, id: 'pricing-' + (index + 1), checkpoint: false }));
  }
  if (phase === 'core') {
    const core = pricing.length ? manifest.migrations.slice(0, -pricing.length) : manifest.migrations;
    const revised = core.length === 143;
    requireThat(revised || core.length === 142, 'Unexpected core manifest length');
    if (revised) requireThat(core[139].path === convergencePath &&
      core[140].path === 'deployment/babal/mariadb-check-parity.sql', 'Unexpected convergence position');
    return core.flatMap((entry, index) => {
      if (revised && index === 139) {
        requireThat(entry.usage === 'additive-maintenance', 'Unexpected convergence migration usage');
        return [{ ...entry, id: '139a', checkpoint: false }];
      }
      const position = index + (revised && index > 139 ? 0 : 1);
      if (position < 59 || position === 139) return [];
      requireThat(entry.usage === 'additive-maintenance', 'Unexpected core migration usage');
      return [{ ...entry, id: String(position), checkpoint: position === 137 }];
    });
  }
  requireThat(phase === 'owner', 'Use core, owner or pricing for --phase');
  requireThat(manifest.ownerAppliedMigrations.length === 9, 'Unexpected owner manifest length');
  return manifest.ownerAppliedMigrations.map((entry, index) => {
    const id = String(164 + index).padStart(4, '0');
    requireThat(entry.d1.path.startsWith('drizzle/' + id + '_') &&
      entry.usage === 'owner-applied', 'Unexpected owner migration order or usage');
    return { ...entry, id };
  });
}

export function verifiedSql(data, expected, id) {
  requireThat(sha256(data) === expected, 'File fingerprint differs for ' + id);
  return data;
}

export function checkpointSql(sqlBytes) {
  // Retain the manifest-pinned 137 read predicates and stop before its first
  // DDL-building statement. Require the already-completed prerequisite branch.
  const source = sqlBytes.toString('utf8');
  const start = source.indexOf('DELIMITER $$');
  const end = source.indexOf(" SET @hb_bootstrap_ddl='';");
  requireThat(start >= 0 && end > start, 'Unknown position 137 checkpoint boundary');
  return source.slice(start, end) + `
 IF old_index_count<>0 OR new_index_count<>2 OR
   (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND ((TABLE_NAME='order_items' AND COLUMN_NAME IN ('commission_base_paisa','commission_rule_version','seller_agreement_version'))
      OR (TABLE_NAME='return_requests' AND COLUMN_NAME='original_seal_intact')
      OR (TABLE_NAME='seller_profiles' AND COLUMN_NAME='settlement_terms_reference')))<>5 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_prerequisites_not_already_installed';
 END IF;
END$$
DELIMITER ;
`;
}

/** @type {(step: {id: string}) => unknown} */
const skipCapture = () => undefined;
/** @type {(step: {id: string}, values: unknown) => void} */
const skipVerify = () => {};

export function applySchema({ steps, approval, hosted, inspect, execute, record, capture = skipCapture, verify = skipVerify }) {
  requireThat(hex.test(approval.target) && hex.test(approval.before), 'Invalid approved fingerprint');
  if (hosted) {
    requireThat(Object.keys(approval.after ?? {}).length === steps.length &&
      steps.every(step => hex.test(approval.after?.[step.id])), 'Hosted apply requires every reviewed post-step fingerprint');
  }
  let expected = approval.before;
  for (const step of steps) {
    const before = inspect();
    requireThat(before.target === approval.target && before.schema === expected,
      'Target or before fingerprint differs at ' + step.id);
    const started = Date.now();
    const originalValues = capture(step);
    record({ event: 'started', id: step.id, before: before.schema });
    execute(step, approval.target);
    const after = inspect();
    requireThat(after.target === approval.target &&
      (!hosted || after.schema === approval.after[step.id]) &&
      (!step.checkpoint || after.schema === before.schema), 'Target or after fingerprint differs at ' + step.id);
    verify(step, originalValues);
    expected = after.schema;
    record({ event: 'finished', id: step.id, after: after.schema, elapsedMs: Date.now() - started });
  }
  return expected;
}

// Session-bound identity used immediately before the migration in that very
// same connection. No reconnect can send a later statement to another server.
const identitySql = 'SHA2(JSON_ARRAY(DATABASE(),@@hostname,@@port,@@socket,@@server_id,@@version,' +
  '@@sql_mode,@@foreign_key_checks,@@check_constraint_checks,@@lower_case_table_names),256)';

const schemaQueries = [
  ['SCHEMATA', 'SCHEMA_NAME', ["'database'", 'DEFAULT_CHARACTER_SET_NAME', 'DEFAULT_COLLATION_NAME']],
  ['TABLES', 'TABLE_SCHEMA', ["'table'", 'TABLE_NAME', 'TABLE_TYPE', 'ENGINE', 'ROW_FORMAT', 'TABLE_COLLATION']],
  ['COLUMNS', 'TABLE_SCHEMA', ["'column'", 'TABLE_NAME', 'COLUMN_NAME', 'ORDINAL_POSITION', 'COLUMN_TYPE',
    'IS_NULLABLE', 'COLUMN_DEFAULT', 'EXTRA', 'COLLATION_NAME', 'GENERATION_EXPRESSION']],
  ['STATISTICS', 'TABLE_SCHEMA', ["'index'", 'TABLE_NAME', 'INDEX_NAME', 'NON_UNIQUE', 'SEQ_IN_INDEX',
    'COLUMN_NAME', 'SUB_PART', 'COLLATION', 'INDEX_TYPE', 'IGNORED']],
  ['KEY_COLUMN_USAGE', 'TABLE_SCHEMA', ["'key-column'", 'TABLE_NAME', 'CONSTRAINT_NAME', 'COLUMN_NAME',
    'ORDINAL_POSITION', "IF(REFERENCED_TABLE_SCHEMA=DATABASE(),'@local',REFERENCED_TABLE_SCHEMA)",
    'REFERENCED_TABLE_NAME', 'REFERENCED_COLUMN_NAME', 'POSITION_IN_UNIQUE_CONSTRAINT']],
  ['REFERENTIAL_CONSTRAINTS', 'CONSTRAINT_SCHEMA',
    ["'foreign-key'", 'TABLE_NAME', 'CONSTRAINT_NAME', 'MATCH_OPTION', 'DELETE_RULE', 'UPDATE_RULE']],
  ['CHECK_CONSTRAINTS', 'CONSTRAINT_SCHEMA', ["'check'", 'TABLE_NAME', 'CONSTRAINT_NAME', 'CHECK_CLAUSE']],
  ['TRIGGERS', 'TRIGGER_SCHEMA', ["'trigger'", 'TRIGGER_NAME', 'EVENT_OBJECT_TABLE', 'ACTION_TIMING',
    'EVENT_MANIPULATION', 'ACTION_ORDER', 'ACTION_STATEMENT', 'SQL_MODE', 'COLLATION_CONNECTION',
    'CHARACTER_SET_CLIENT', 'DATABASE_COLLATION']],
  ['VIEWS', 'TABLE_SCHEMA', ["'view'", 'TABLE_NAME',
    "REPLACE(VIEW_DEFINITION,CONCAT(CHAR(96),DATABASE(),CHAR(96),'.'),'@local.')",
    'CHECK_OPTION', 'SECURITY_TYPE', 'CHARACTER_SET_CLIENT', 'COLLATION_CONNECTION']],
  ['ROUTINES', 'ROUTINE_SCHEMA', ["'routine'", 'ROUTINE_NAME']],
  ['EVENTS', 'EVENT_SCHEMA', ["'event'", 'EVENT_NAME']],
];
const catalogSql = schemaQueries.map(([table, column, fields]) =>
  'SELECT HEX(JSON_ARRAY(' + fields.join(',') + ')) FROM information_schema.' + table +
  ' WHERE ' + column + '=DATABASE()').join('\nUNION ALL\n') + ';\n';

function privateFile(file, label) {
  requireThat(isAbsolute(file ?? ''), 'Use an absolute path for ' + label);
  const metadata = lstatSync(file);
  requireThat(metadata.isFile() && (metadata.mode & 0o777) === 0o600 &&
    metadata.uid === process.getuid(), label + ' must be an owned regular file with mode 0600');
  return readFileSync(file);
}

export function clientProtocol(config, target) {
  const fields = new Map();
  let sectionSeen = false;
  for (const line of config.toString().split(/\r?\n/).map(line => line.trim())) {
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line === '[client]' && !sectionSeen) {
      sectionSeen = true;
      continue;
    }
    const match = /^([a-z-]+)\s*=\s*(.+)$/.exec(line);
    requireThat(sectionSeen && match && ['user', 'password', 'host', 'port', 'socket', 'ssl-ca',
      'ssl-verify-server-cert', 'ssl'].includes(match[1]) && !fields.has(match[1]),
    'Use a single [client] section with only the documented connection options');
    fields.set(match[1], match[2]);
  }
  requireThat(fields.has('user'), 'The connection file must name an account');
  if (fields.has('socket')) {
    requireThat(isAbsolute(fields.get('socket')) && !fields.has('host') && !fields.has('port'),
      'Use an explicit local socket without host or port');
    return 'SOCKET';
  }
  const host = fields.get('host') ?? '';
  const port = Number(fields.get('port') ?? 3306);
  requireThat(/^[A-Za-z0-9.:-]+$/.test(host) && Number.isInteger(port) && port > 0 && port <= 65535,
    'Specify the database host and a valid port');
  const loopback = host === '127.0.0.1' || host === '::1';
  requireThat(target !== 'rehearsal' || loopback, 'Rehearsal requires a local socket or loopback');
  if (!loopback || target !== 'rehearsal') {
    requireThat(fields.get('ssl-verify-server-cert') === '1' && fields.get('ssl') === '1' &&
      isAbsolute(fields.get('ssl-ca') ?? ''), 'Hosted TCP requires TLS with a trusted CA and hostname verification');
  }
  return 'TCP';
}

function makeClient(config, target, database) {
  const protocol = clientProtocol(privateFile(config, 'Connection file'), target);
  return (sql, step = 'read-only check') => {
    const result = spawnSync('mariadb', [
      '--defaults-file=' + config, '--protocol=' + protocol, '--database=' + database,
      '--batch', '--raw', '--skip-column-names', '--skip-force', '--skip-reconnect',
      '--binary-mode', '--comments', '--local-infile=0', '--default-character-set=utf8mb4',
    ], { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { PATH: process.env.PATH, LC_ALL: 'C' } });
    if (result.status !== 0) {
      const number = result.stderr?.match(/ERROR (\d+).*?(?: at line (\d+))?:/);
      throw new Error('MariaDB failed at ' + step + (number ? ' with error ' + number[1] +
        (number[2] ? ' at line ' + number[2] : '') : '') + '. Inspect privately before another attempt.');
    }
    return result.stdout.trimEnd();
  };
}

function identity(client, database) {
  const [observed, target, version, foreignKeys, checks] = client(
    'SELECT DATABASE(),' + identitySql + ',@@version,@@foreign_key_checks,@@check_constraint_checks;').split('\t');
  requireThat(observed === database && hex.test(target) && /^10\.11\.\d+.*MariaDB/i.test(version) &&
    foreignKeys === '1' && checks === '1', 'Check the intended MariaDB 10.11 target and active constraint checks');
  return target;
}

function inspectSchema(client, database) {
  const target = identity(client, database);
  const rows = readOnTarget(client, target, catalogSql).split('\n').sort();
  const definitions = rows.map(row => JSON.parse(Buffer.from(row, 'hex').toString('utf8')));
  requireThat(definitions.some(row => row[0] === 'table') &&
    definitions.some(row => row[0] === 'trigger') &&
    definitions.every(row => !['routine', 'event'].includes(row[0]) &&
      !(row[0] === 'trigger' && row[6] == null) && !(row[0] === 'view' && row[2] == null)),
  'The schema fingerprint requires visible trigger and view definitions and no stored routines or events');
  return { target, schema: sha256(rows.join('\n')) };
}

function readOnTarget(client, target, sql) {
  const output = client('START TRANSACTION READ ONLY;\nSELECT ' + identitySql + ';\n' + sql + '\nROLLBACK;');
  const newline = output.indexOf('\n');
  requireThat(newline > 0 && output.slice(0, newline) === target, 'Target changed during the metadata check');
  return output.slice(newline + 1);
}

function convergenceData(client, target) {
  return Object.fromEntries(Object.entries(convergenceColumns).flatMap(([table, columns]) => {
    const fields = columns.map(column => `SHA2(JSON_ARRAY(HEX(CAST(id AS BINARY)),HEX(CAST(\`${column}\` AS BINARY))),256)`);
    const [count, ...rows] = readOnTarget(client, target, `SELECT COUNT(*) FROM \`${table}\`;
      SELECT ${fields.join(',')} FROM \`${table}\` ORDER BY BINARY id;`).split('\n');
    const cells = rows.map(row => row.split('\t'));
    requireThat(count === String(cells.length) && cells.every(row => row.length === columns.length && row.every(value => hex.test(value))),
      'Could not capture original column values for ' + table);
    return columns.map((column, index) => [table + '.' + column, sha256(cells.map(row => row[index]).join('\n'))]);
  }));
}

function guardSession(target) {
  return `DELIMITER $$
BEGIN NOT ATOMIC
 IF NOT (${identitySql} <=> '${target}') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='approved_schema_target_changed';
 END IF;
END$$
DELIMITER ;
`;
}

function reportSql(manifest) {
  const generator = fileURLToPath(new URL('../generate-production-schema-check.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [generator, '--manifest', manifest, '--metadata-only-stdout'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  requireThat(result.status === 0 && result.stdout.startsWith('-- MariaDB 10.11.'), 'Could not build the pinned metadata report');
  return result.stdout;
}

function verifyPricingSchema(client, target, inventory) {
  const output = readOnTarget(client, target, pricingSchemaSql(inventory) + ';');
  const findings = pricingSchemaFindings(output.split('\n').map(row => {
    const [kind, objectName, matched] = row.split('\t');
    return { kind, objectName, matched: Number(matched) };
  }));
  requireThat(findings.ready, 'Pricing metadata is missing or different. Review the private pricing schema report.');
}

function run() {
  const { values, positionals: [command, ...extra] } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['target', 'database', 'credentials', 'package-root', 'manifest-sha256', 'owner-root', 'phase',
      'approval', 'backup-receipt', 'journal', 'core-journal'].map(name => [name, { type: 'string' }])),
  });
  requireThat(!extra.length && ['report', 'fingerprint', 'apply'].includes(command),
    'Use report, fingerprint or apply');
  const { target, credentials, phase } = values;
  const database = { production: 'hastabaz_marketplace', staging: 'hastabaz_staging',
    rehearsal: values.database }[target];
  requireThat(database && (target === 'rehearsal' ? /^hb_schema_rehearsal_[a-z0-9_]{1,40}$/.test(database) :
    ['production', 'staging'].includes(target) && !values.database), 'Use an explicit approved target');

  if (command === 'fingerprint') {
    console.log(JSON.stringify(inspectSchema(makeClient(credentials, target, database), database)));
    return;
  }
  const root = values['package-root'];
  requireThat(isAbsolute(root ?? ''), 'Use an absolute package root');
  const file = join(root, manifestPath);
  requireThat(phase !== 'pricing' || values['manifest-sha256'], 'Pricing requires the exact reviewed --manifest-sha256');
  const expectedManifest = values['manifest-sha256'] ?? historicalManifestSha;
  requireThat(hex.test(expectedManifest), 'Use a reviewed SHA-256 for --manifest-sha256');
  const manifest = JSON.parse(verifiedSql(readFileSync(file), expectedManifest, 'release manifest'));
  const release = manifest.release;
  requireThat(/^hastabazaar-release-[a-z0-9][a-z0-9-]*$/.test(release) &&
    (expectedManifest !== historicalManifestSha || release === historicalRelease), 'Unexpected release manifest');
  if (command === 'report') {
    const client = makeClient(credentials, target, database);
    const approvedTarget = identity(client, database);
    if (phase === 'pricing') migrationSteps(manifest, phase);
    const sql = phase === 'pricing' ? pricingSchemaReportSql(manifest.pricingSchema) + ';' : reportSql(file);
    const output = readOnTarget(client, approvedTarget, sql);
    requireThat(output.length > 0, 'MariaDB returned an empty metadata report');
    console.log('scope\tkind\tobjectName\trequiredCount\tmatchedCount\tmissingOrDifferentCount\tunverifiedCount');
    console.log(output);
    return;
  }

  const sqlRoot = phase === 'owner' ? values['owner-root'] : root;
  requireThat(isAbsolute(sqlRoot ?? ''), 'Use an absolute path to the reviewed SQL root');
  const steps = migrationSteps(manifest, phase).map(step => {
    requireThat(/^deployment\/babal\/mariadb-[a-z0-9-]+\.sql$/.test(step.path), 'Invalid companion name');
    const data = verifiedSql(readFileSync(join(sqlRoot, step.path)), step.sha256, step.id);
    return { ...step, sql: step.checkpoint ? checkpointSql(data) : data };
  });

  const approval = JSON.parse(privateFile(values.approval, 'Approval'));
  requireThat(approval.release === release && approval.phase === phase && approval.environment === target &&
    approval.writersPaused === true && hex.test(approval.backupSha256) &&
    sha256(privateFile(values['backup-receipt'], 'Verified backup receipt')) === approval.backupSha256,
  'Approval must match the release, target, phase, writer pause and verified backup receipt');
  if (phase === 'owner') {
    const rows = privateFile(values['core-journal'], 'Core journal').toString().trim().split('\n').map(line => JSON.parse(line));
    const first = rows[0];
    const last = rows.at(-1);
    requireThat(first.event === 'phase' && first.release === release && first.phase === 'core' &&
      first.target === approval.target && last.event === 'complete' && last.after === approval.before,
    'The owner batch requires a completed core journal for this target and fingerprint');
  }

  const client = makeClient(credentials, target, database);
  const journal = values.journal;
  requireThat(isAbsolute(journal ?? ''), 'Use a new absolute journal path');
  const fd = openSync(journal, 'wx', 0o600);
  const record = row => {
    writeSync(fd, JSON.stringify(row) + '\n');
    fsyncSync(fd);
  };
  try {
    record({ event: 'phase', release, phase, target: approval.target });
    const after = applySchema({
      steps, approval, hosted: target !== 'rehearsal', record,
      inspect: () => inspectSchema(client, database),
      execute: (step, expectedTarget) => {
        const start = step.checkpoint ? 'START TRANSACTION READ ONLY;\n' : '';
        const end = step.checkpoint ? '\nROLLBACK;\n' : '';
        client(Buffer.concat([Buffer.from(start + guardSession(expectedTarget)), Buffer.from(step.sql),
          Buffer.from(end)]), step.id);
      },
      capture: step => step.id === '139a' ? convergenceData(client, approval.target) : undefined,
      verify: (step, originalValues) => {
        if (step.id === '139a') {
          const current = convergenceData(client, approval.target);
          for (const [column, original] of Object.entries(originalValues)) {
            requireThat(current[column] === original, 'Original column values differ at ' + column);
            record({ event: 'column-check', id: step.id, column, mismatches: 0 });
          }
        }
        const sql = upgradeCheckpoints[step.id];
        if (!sql) return;
        const mismatches = readOnTarget(client, approval.target, sql);
        requireThat(mismatches === '0', 'Data checkpoint differs at ' + step.id);
        record({ event: 'data-check', id: step.id, mismatches: 0 });
      },
    });
    if (phase === 'pricing') verifyPricingSchema(client, approval.target, manifest.pricingSchema);
    record({ event: 'complete', after });
    console.log('Verified ' + phase + ' phase. Review the private journal before advancing.');
  } finally {
    closeSync(fd);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid local JSON input' :
      error?.code ? 'Could not access a required local file or command' : error.message);
    process.exitCode = 1;
  }
}
