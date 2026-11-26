import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { customerFeeTriggerDefinitions } from '../lib/operations/fee-schema-readiness.mjs';
import { pricingSchemaQuery, registeredPricingMigrations } from '../lib/operations/pricing-schema-readiness.mjs';

const rootFile = (path) => fileURLToPath(new URL(path, import.meta.url));
const { values } = parseArgs({
  options: {
    manifest: { type: 'string', default: rootFile('../deployment/babal/release-manifest.json') },
    output: { type: 'string', default: rootFile('../deployment/babal/check-production-schema.sql') },
    'metadata-only-stdout': { type: 'boolean' },
  },
});
const manifest = JSON.parse(await readFile(values.manifest, 'utf8'));
const pricingMigrations = registeredPricingMigrations(manifest);
const pricingQuery = pricingMigrations.length ? pricingSchemaQuery(manifest.pricingSchema) : null;
const pricingResults = pricingQuery ? `,\n${pricingQuery.ctes},\npricing_results AS (${pricingQuery.select})` : '';
const requirements = [];
const add = (kind, tableName, name, expected = '', details = {}) => {
  requirements.push({ migration: '', kind, tableName, name, expected, ...details });
};

const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whitespace = '[[:space:]]*';

// Compare full clauses with the same token boundaries and literal case as the
// runtime readiness check. MariaDB may reformat whitespace and quote identifiers.
function definitionPattern(definition, generated = false) {
  const source = definition.trim().replace(/;$/, '').trimEnd();
  const tokenPattern = /'(?:(?:'')|[^'\\])*'|`[a-z_][a-z0-9_]*`|[a-z_][a-z0-9_]*|\d+|<=>|<>|!=|<=|>=|[!=<>(),;.+*/%-]/giy;
  const tokens = [];
  while (tokenPattern.lastIndex < source.length) {
    tokenPattern.lastIndex += source.slice(tokenPattern.lastIndex).match(/^\s*/)[0].length;
    const match = tokenPattern.exec(source);
    if (!match) throw new Error('Unsupported SQL definition in release manifest: ' + definition);
    const token = match[0];
    const word = token.replaceAll('`', '');
    if (/^[a-z_]/i.test(word)) {
      tokens.push('(?i:(?:`' + word + '`|(?<![a-z0-9_])' + word + '(?![a-z0-9_])))');
    } else if (/^\d+$/.test(token)) {
      tokens.push('(?<![0-9])' + token + '(?![0-9])');
    } else {
      tokens.push(escapePattern(token));
    }
  }
  if (generated) {
    // MariaDB prints unary BINARY as CAST in generated-column metadata.
    const binaryColumn = tokens.findIndex((token) => token.startsWith('(?i:(?:`binary`'));
    if (binaryColumn >= 0) {
      const [binary, column] = tokens.slice(binaryColumn, binaryColumn + 2);
      tokens.splice(binaryColumn, 2, '(?:' + binary + whitespace + column +
        '|(?i:cast)' + whitespace + '\\(' + whitespace + column +
        '[[:space:]]+(?i:as)[[:space:]]+(?i:binary|char[[:space:]]+charset[[:space:]]+binary)' +
        whitespace + '\\))');
    }
  }
  return '(?-i)\\A' + whitespace + tokens.join(whitespace) + whitespace + ';?' + whitespace + '\\z';
}

const objectKey = (key) => {
  const parts = key.split('.');
  if (parts.length !== 2 || parts.some((part) => !part)) throw new Error('Invalid manifest identifier: ' + key);
  return parts;
};

function addTables(tables, migration) {
  for (const [table, columns] of Object.entries(tables ?? {})) {
    if (!migration || !manifest.requiredTables?.[table]) add('table', table, '', '', { migration });
    for (const column of columns) add('column', table, column, '', { migration });
  }
}

function addTriggers(requirements, shapes, exact, migration) {
  for (const name of new Set([...Object.keys(requirements), ...Object.keys(shapes), ...Object.keys(exact)])) {
    const { table = '', event = '', timing = '' } = shapes[name] ?? {};
    const fragments = requirements[name] ?? [];
    const definition = exact[name] ?? (!migration && shapes[name]
      ? customerFeeTriggerDefinitions[name]?.mariadb ?? `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${fragments[2]}'`
      : undefined);
    const details = { migration, event, timing };
    if (definition) {
      add('trigger-exact', table, name, definitionPattern(definition), details);
    } else {
      for (const fragment of fragments.length ? fragments : ['']) {
        add('trigger', table, name, fragment, details);
      }
    }
  }
}

function addChecks(requirements, exact, migration) {
  for (const key of new Set([...Object.keys(requirements), ...Object.keys(exact)])) {
    const [table, name] = objectKey(key);
    if (exact[key]) {
      let definition = exact[key];
      // MariaDB omits redundant groups of AND predicates joined by OR in these
      // two reviewed clauses. Strip only the verified redundant grouping shape.
      if (migration && key === 'occasion_discovery.occasion_discovery_window') {
        definition = definition.replace(/^\(([^()]+)\) OR\s*\(([^()]+)\)$/i, '$1 OR $2');
      }
      if (migration && key === 'delivery_partners.delivery_partner_default') {
        definition = definition.replace(/^(default_slot IS NULL OR)\s*\(([^()]+)\)$/i, '$1 $2');
      }
      add('check-exact', table, name, definitionPattern(definition), { migration });
    } else {
      for (const fragment of requirements[key].length ? requirements[key] : ['']) {
        add('check', table, name, fragment, { migration });
      }
    }
  }
}

function addUniqueIndexes(indexes, migration) {
  for (const [key, columns] of Object.entries(indexes ?? {})) {
    add('unique-index', ...objectKey(key), columns.join(','), { migration, columnCount: columns.length });
  }
}

addTables(manifest.requiredTables, '');
addTriggers(manifest.requiredTriggers ?? {}, manifest.requiredTriggerShapes ?? {}, manifest.requiredExactTriggerDefinitions ?? {}, '');
addChecks(manifest.requiredChecks ?? {}, manifest.requiredExactChecks ?? {}, '');
for (const [key, fragments] of Object.entries(manifest.requiredGeneratedColumns ?? {})) {
  for (const fragment of fragments) add('generated', ...objectKey(key), definitionPattern(fragment, true));
}
for (const [key, collation] of Object.entries(manifest.requiredColumnCollations ?? {})) {
  add('collation', ...objectKey(key), collation);
}
addUniqueIndexes(manifest.requiredUniqueIndexes, '');
for (const [key, { columns, referencedTable, referencedColumns }] of Object.entries(manifest.requiredForeignKeys ?? {})) {
  add('foreign-key', ...objectKey(key), columns.join(','), {
    columnCount: columns.length,
    referencedTable,
    referencedColumns: referencedColumns.join(','),
  });
}
for (const companion of manifest.ownerAppliedMigrations ?? []) {
  const migration = /^drizzle\/(\d{4})_/.exec(companion.d1.path)?.[1];
  if (!migration) throw new Error('Missing migration number: ' + companion.d1.path);
  const priorLength = requirements.length;
  addTables(companion.requiredTables, migration);
  addTriggers({}, companion.requiredTriggerShapes ?? {}, companion.requiredExactTriggerDefinitions ?? {}, migration);
  addChecks({}, companion.requiredChecks ?? {}, migration);
  addUniqueIndexes(companion.requiredUniqueIndexes, migration);
  if (requirements.length === priorLength) throw new Error('Owner migration ' + migration + ' has no schema requirements');
}

// A hex literal keeps the generated expectations independent of SQL quoting
// mode and client encoding. The manifest remains the readable inventory.
const fields = ['migration', 'kind', 'tableName', 'name', 'expected', 'event', 'timing',
  'columnCount', 'referencedTable', 'referencedColumns'];
const rows = requirements.map((row) => fields.map((field) => row[field]));
const chunks = Buffer.from(JSON.stringify(rows), 'utf8').toString('hex').match(/.{1,4096}/g);
const inventory = '      ' + chunks.map((chunk) => '0x' + chunk).join(',\n      ');
const metadataOnly = values['metadata-only-stdout'];
const metadataReport = `
SELECT COALESCE(NULLIF(migration, ''), 'core') AS scope, kind,
       '' AS objectName, COUNT(*) AS requiredCount, SUM(found = 1) AS matchedCount,
       SUM(found = 0) AS missingOrDifferentCount, SUM(found = -1) AS unverifiedCount
FROM results GROUP BY migration, kind
UNION ALL
SELECT COALESCE(NULLIF(migration, ''), 'core'), kind,
       CONCAT_WS('.', NULLIF(tableName, ''), NULLIF(name, '')), NULL, NULL, found = 0, found = -1
FROM results WHERE found <> 1
${pricingResults ? `UNION ALL
SELECT 'pricing', kind, '', COUNT(*), SUM(matched), SUM(matched=0), 0 FROM pricing_results GROUP BY kind
UNION ALL
SELECT 'pricing', kind, objectName, NULL, NULL, 1, 0 FROM pricing_results WHERE matched=0
` : ''}ORDER BY scope, kind, objectName;\n`;
const report = `-- MariaDB 10.11. Select the intended database in the client before running this file.
-- Read-only metadata. Missing visibility also appears as missing metadata.
-- To regenerate against a specific package manifest, pass --manifest to
-- scripts/generate-production-schema-check.mjs.
WITH
expected AS (
  SELECT requirements.*
  FROM JSON_TABLE(
    CONVERT(CONCAT(
${inventory}
    ) USING utf8mb4), '$[*]' COLUMNS (
      migration VARCHAR(4) PATH '$[0]',
      kind VARCHAR(20) PATH '$[1]',
      tableName VARCHAR(64) PATH '$[2]',
      name VARCHAR(64) PATH '$[3]',
      expected TEXT PATH '$[4]',
      event VARCHAR(8) PATH '$[5]',
      timing VARCHAR(8) PATH '$[6]',
      columnCount INTEGER PATH '$[7]',
      referencedTable VARCHAR(64) PATH '$[8]',
      referencedColumns TEXT PATH '$[9]'
    )
  ) AS requirements
),
indexes AS (
  SELECT TABLE_NAME, INDEX_NAME, COUNT(*) AS columnCount,
         GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsInOrder
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
  GROUP BY TABLE_NAME, INDEX_NAME
  HAVING MAX(NON_UNIQUE) = 0 AND COUNT(SUB_PART) = 0
     AND MIN(SEQ_IN_INDEX) = 1 AND MAX(SEQ_IN_INDEX) = COUNT(*)
),
foreign_keys AS (
  SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, COUNT(*) AS columnCount,
         MIN(k.REFERENCED_TABLE_NAME) AS referencedTable,
         GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION) AS columnsInOrder,
         GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION) AS referencedColumns
  FROM information_schema.KEY_COLUMN_USAGE AS k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS AS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME
   AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_SCHEMA = DATABASE()
    AND r.DELETE_RULE IN ('RESTRICT', 'NO ACTION') AND r.UPDATE_RULE IN ('RESTRICT', 'NO ACTION')
  GROUP BY k.TABLE_NAME, k.CONSTRAINT_NAME
  HAVING MIN(k.ORDINAL_POSITION) = 1 AND MAX(k.ORDINAL_POSITION) = COUNT(*)
     AND COUNT(DISTINCT k.REFERENCED_TABLE_NAME) = 1
),
observed AS (
  SELECT 'table' AS kind, TABLE_NAME AS tableName, '' AS name, '' AS objectValue,
         '' AS collationName, '' AS event, '' AS timing, '' AS triggerTable,
         0 AS columnCount, '' AS referencedTable, '' AS referencedColumns
  FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  UNION ALL
  SELECT 'column', TABLE_NAME, COLUMN_NAME, GENERATION_EXPRESSION, COLLATION_NAME, '', '', '', 0, '', ''
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  UNION ALL
  SELECT 'trigger', '', TRIGGER_NAME, ACTION_STATEMENT, '', EVENT_MANIPULATION, ACTION_TIMING, EVENT_OBJECT_TABLE, 0, '', ''
  FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
  UNION ALL
  SELECT 'check', TABLE_NAME, CONSTRAINT_NAME, CHECK_CLAUSE, '', '', '', '', 0, '', ''
  FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
  UNION ALL
  SELECT 'unique-index', TABLE_NAME, INDEX_NAME, columnsInOrder, '', '', '', '', columnCount, '', ''
  FROM indexes
  UNION ALL
  SELECT 'foreign-key', TABLE_NAME, CONSTRAINT_NAME, columnsInOrder, '', '', '', '', columnCount, referencedTable, referencedColumns
  FROM foreign_keys
),
matches AS (
  SELECT e.*, COALESCE(CASE${metadataOnly ? "\n    WHEN e.kind IN ('trigger', 'trigger-exact') AND o.objectValue IS NULL THEN -1" : ''}
    WHEN o.kind IS NULL THEN 0
    WHEN e.kind = 'collation' THEN o.collationName = e.expected
    WHEN e.kind = 'generated' THEN o.objectValue REGEXP e.expected
    WHEN e.kind IN ('trigger', 'trigger-exact') THEN
      (e.tableName = '' OR BINARY o.triggerTable = BINARY e.tableName)
      AND (e.event = '' OR o.event = e.event)
      AND (e.timing = '' OR o.timing = e.timing)
      AND IF(e.kind = 'trigger-exact', o.objectValue REGEXP e.expected,
             LOCATE(e.expected, REPLACE(LOWER(o.objectValue), CHAR(96), '')) > 0)
    WHEN e.kind = 'check-exact' THEN o.objectValue REGEXP e.expected
    WHEN e.kind = 'check' THEN LOCATE(e.expected, REPLACE(LOWER(o.objectValue), CHAR(96), '')) > 0
    WHEN e.kind = 'unique-index' THEN o.columnCount = e.columnCount AND BINARY o.objectValue = BINARY e.expected
    WHEN e.kind = 'foreign-key' THEN o.columnCount = e.columnCount
      AND BINARY o.objectValue = BINARY e.expected AND BINARY o.referencedTable = BINARY e.referencedTable
      AND BINARY o.referencedColumns = BINARY e.referencedColumns
    ELSE 1
  END, 0) AS found
  FROM expected AS e LEFT JOIN observed AS o
    ON o.kind = CASE
      WHEN e.kind IN ('collation', 'generated') THEN 'column'
      WHEN e.kind = 'trigger-exact' THEN 'trigger'
      WHEN e.kind = 'check-exact' THEN 'check'
      ELSE e.kind
    END
   AND o.tableName = IF(e.kind IN ('trigger', 'trigger-exact'), '', e.tableName)
   AND o.name = e.name
   AND BINARY o.tableName = BINARY IF(e.kind IN ('trigger', 'trigger-exact'), '', e.tableName)
   AND BINARY o.name = BINARY e.name
  WHERE DATABASE() IS NOT NULL
),
results AS (
  SELECT migration, kind, tableName, name, MIN(found) AS found
  FROM matches
  GROUP BY migration, kind, tableName, name
)${pricingResults}${metadataOnly ? metadataReport : `,
report AS (
  SELECT 0 AS sortOrder, 'Database' AS section, COALESCE(DATABASE(), '(none)') AS item,
         IF(DATABASE() IS NULL, 'SELECT A DATABASE', 'SELECTED') AS status,
         'Results reflect metadata visible to this account.' AS detail
  UNION ALL
  SELECT 1, 'Release manifest', 'Core schema',
         IF(COUNT(*) > 0 AND COUNT(*) = SUM(found), 'PRESENT', 'MISSING'),
         CONCAT(COUNT(*) - COALESCE(SUM(found), 0), ' missing or different metadata requirements')
  FROM results WHERE migration = '' HAVING COUNT(*) > 0
  UNION ALL
  SELECT 2, 'Owner migration', migration,
         CASE WHEN MIN(found) = 1 THEN 'PRESENT' WHEN MAX(found) = 0 THEN 'MISSING' ELSE 'PARTIAL' END,
         CONCAT(COUNT(*) - SUM(found), ' of ', COUNT(*), ' metadata requirements missing or different')
  FROM results WHERE migration <> '' GROUP BY migration
  UNION ALL
  SELECT DISTINCT 3, IF(migration = '', 'Core schema detail', CONCAT('Migration ', migration)),
         CONCAT(kind, ': ', CONCAT_WS('.', NULLIF(tableName, ''), NULLIF(name, ''))),
         'MISSING OR DIFFERENT', 'Check the selected manifest and database permissions.'
  FROM results WHERE found = 0
${pricingResults ? `  UNION ALL
  SELECT 4, 'Pricing schema', 'Launch pricing', IF(COUNT(*)=SUM(matched), 'PRESENT', 'MISSING OR DIFFERENT'),
         CONCAT(SUM(matched=0), ' of ', COUNT(*), ' metadata requirements missing or different') FROM pricing_results
  UNION ALL
  SELECT 5, 'Pricing schema detail', CONCAT(kind, ': ', objectName), 'MISSING OR DIFFERENT',
         'Check the selected manifest and database permissions.' FROM pricing_results WHERE matched=0
` : ''})
SELECT section, item, status, detail FROM report ORDER BY sortOrder, section, item;
`}`;
if (metadataOnly) process.stdout.write(report);
else await writeFile(values.output, report);
