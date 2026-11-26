const hashes = [
  ['order-item-pricing-snapshots', '4608c923f6a2f4786f7612b62f3082a091285683866790bb89773fa1d71efcc2'],
  ['seller-shipment-delivery-allocations', 'c2ae6548aede4a042a0bf56f7c75362e91bb9bd26c9344078f7bf81c2ea003cd'],
  ['priced-return-effects', '8c3d8ea4ea8d5b8bca821b0d72048d5959576a642b2022253e8dcaa3dfe5612b'],
  ['seller-dispatch-evidence', '1bcc3539066082368434cc8a236ea34fee341acaaa09fc496c6c147e80fbebbd'],
  ['refund-route-reservations', '5912b7685b6f76ab8d5ec2ef0703d797017c1229b4ff721356c61094648fad3d'],
  ['priced-order-acceptance-lock', '22e86a4185efa41bca8fe78a2c82a58b3d6e48bba466b94071ed0b50a49859b6'],
];

export const pricingMigrationEntries = hashes.map(([name, sha256]) => ({
  path: `deployment/babal/mariadb-${name}.sql`, sha256, usage: 'pricing-maintenance',
}));
const digestPattern = /^[a-f0-9]{64}$/;
const identifierPattern = /^[a-z][a-z0-9_]{0,63}$/;
const replacedTrigger = 'refund_cost_original_capacity';

/** @typedef {{tables:Record<string,string>, triggers:Record<string,string>, views:Record<string,string>, tableTriggers:Record<string,string[]>}} PricingInventory */

/** @param {{migrations?: {path:string,sha256?:string,usage:string}[],pricingSchema?:unknown}} manifest */
export function registeredPricingMigrations(manifest) {
  const migrations = manifest.migrations ?? [];
  const selected = migrations.filter(entry => entry.usage === 'pricing-maintenance');
  if (!selected.length && !Object.hasOwn(manifest, 'pricingSchema')) return [];
  if (selected.length !== pricingMigrationEntries.length || migrations.length !== 149 ||
      !isPricingInventory(manifest.pricingSchema) || pricingMigrationEntries.some(({path, sha256, usage}, index) => {
        const entry = migrations[143 + index];
        return entry?.path !== path || entry.sha256 !== sha256 || entry.usage !== usage ||
          migrations.filter(migration => migration.path === path).length !== 1;
      })) throw new Error('Unexpected pricing migration inventory, order or fingerprint');
  return selected;
}

/** @param {unknown} inventory @returns {inventory is PricingInventory} */
function isPricingInventory(inventory) {
  if (!inventory || typeof inventory !== 'object') return false;
  const { tables, triggers, views, tableTriggers } = /** @type {Partial<PricingInventory>} */ (inventory);
  const exactDigests = (values, count) => values && Object.entries(values).length === count &&
    Object.entries(values).every(([name, digest]) => identifierPattern.test(name) && typeof digest === 'string' && digestPattern.test(digest));
  return exactDigests(tables, 11) && exactDigests(views, 1) && exactDigests(triggers, 45) &&
    typeof views?.refund_route_bank_terminal_evidence === 'string' && typeof triggers?.[replacedTrigger] === 'string' &&
    !!tableTriggers && Object.keys(tableTriggers).length === 11 &&
    Object.keys(tables ?? {}).every(name => Object.hasOwn(tableTriggers, name) && Array.isArray(tableTriggers[name]) &&
      tableTriggers[name].length > 0 && tableTriggers[name].every(trigger =>
        typeof trigger === 'string' && identifierPattern.test(trigger) && Object.hasOwn(triggers ?? {}, trigger)));
}

/** Read the exact digest pins from the six already reviewed, byte-verified SQL companions.
 * @param {Map<string, Buffer>} assets
 * @returns {PricingInventory}
 */
export function pricingSchemaInventory(assets) {
  const tables = {}, triggers = {}, views = {}, tableTriggers = {};
  for (const source of assets.values()) {
    const sql = source.toString('utf8').replaceAll('\r\n', '\n');
    const preflightEnd = sql.indexOf('\nEND$$\nDELIMITER ;');
    if (preflightEnd < 0) throw new Error('Missing reviewed pricing migration preflight');
    const preflight = sql.slice(0, preflightEnd);
    for (const [, kind, name, query, digest] of preflight.matchAll(/IF EXISTS\(SELECT 1 FROM information_schema\.(TABLES|TRIGGERS) WHERE (?:TABLE_SCHEMA|TRIGGER_SCHEMA)=DATABASE\(\) AND (?:TABLE_NAME|TRIGGER_NAME)='(\w+)'\) AND NOT \(\((SELECT [\s\S]+?)\) <=> '([0-9a-f]{64})'\) THEN/g)) {
      const target = kind === 'TRIGGERS' ? triggers : query.includes('information_schema.VIEWS') ? views : tables;
      if (Object.hasOwn(target, name) && target[name] !== digest) throw new Error('Conflicting pricing fingerprint for ' + name);
      target[name] = digest;
    }
    for (const [, name, allowed] of preflight.matchAll(/EVENT_OBJECT_TABLE='(\w+)' AND TRIGGER_NAME NOT IN\(([^)]+)\)/g)) {
      tableTriggers[name] = [...allowed.matchAll(/'([a-z_]+)'/g)].map(([, trigger]) => trigger);
    }
    const replacement = /BINARY TRIGGER_NAME='refund_cost_original_capacity'\) <=> '([0-9a-f]{64})'\) THEN\n\s+SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='pricing_tail_refund_cost_unverified'/.exec(sql);
    if (replacement) triggers[replacedTrigger] = replacement[1];
  }
  const inventory = { tables, triggers, views, tableTriggers };
  if (!isPricingInventory(inventory)) throw new Error('Incomplete reviewed pricing schema inventory');
  return inventory;
}

/** Shared structure for read-only probes and reports, with safe object names in literals.
 * @param {unknown} inventory
 */
export function pricingSchemaQuery(inventory) {
  if (!isPricingInventory(inventory)) throw new Error('Missing or invalid pricing schema inventory');
  const { tables, triggers, views, tableTriggers } = inventory;
  const names = Object.keys(tables).map(name => `'${name}'`).join(',');
  const triggerNames = Object.keys(triggers).map(name => `'${name}'`).join(',');
  const expected = Object.entries({table: tables, trigger: triggers, view: views})
    .flatMap(([kind, objects]) => Object.entries(objects).map(([name, sha]) =>
      `SELECT '${kind}' AS kind, '${name}' AS objectName, '${sha}' AS digest`)).join('\nUNION ALL ');
  const unexpected = Object.entries(tableTriggers).map(([table, allowed]) =>
    `SELECT 'trigger-set', '${table}', NOT EXISTS(SELECT 1 FROM pricing_trigger_rows
       WHERE BINARY tableName='${table}' AND BINARY objectName NOT IN(${allowed.map(name => `'${name}'`).join(',')}))`).join('\nUNION ALL ');
  const ctes = `pricing_table_rows AS (
 SELECT TABLE_NAME AS objectName, SHA2(JSON_ARRAY('table',TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,CREATE_OPTIONS),256) AS item
 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN(${names}) AND BINARY TABLE_NAME IN(${names})
 UNION ALL SELECT TABLE_NAME,SHA2(JSON_ARRAY('column',COLUMN_NAME,ORDINAL_POSITION,COLUMN_DEFAULT,IS_NULLABLE,DATA_TYPE,COLUMN_TYPE,CHARACTER_SET_NAME,COLLATION_NAME,EXTRA,IS_GENERATED,GENERATION_EXPRESSION,COLUMN_COMMENT),256)
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN(${names}) AND BINARY TABLE_NAME IN(${names})
 UNION ALL SELECT TABLE_NAME,SHA2(JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,COLLATION,SUB_PART,INDEX_TYPE,IGNORED),256)
 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN(${names}) AND BINARY TABLE_NAME IN(${names})
 UNION ALL SELECT TABLE_NAME,SHA2(JSON_ARRAY('check',CONSTRAINT_NAME,CHECK_CLAUSE,LEVEL),256)
 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN(${names}) AND BINARY TABLE_NAME IN(${names})
 UNION ALL SELECT k.TABLE_NAME,SHA2(JSON_ARRAY('fk',k.CONSTRAINT_NAME,k.COLUMN_NAME,k.ORDINAL_POSITION,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,IF(BINARY k.REFERENCED_TABLE_SCHEMA=BINARY DATABASE(),'current',k.REFERENCED_TABLE_SCHEMA),f.UPDATE_RULE,f.DELETE_RULE),256)
 FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f
 ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND f.TABLE_NAME=k.TABLE_NAME
 WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME IN(${names}) AND BINARY k.TABLE_NAME IN(${names}) AND k.REFERENCED_TABLE_NAME IS NOT NULL
), pricing_trigger_rows AS (
 SELECT TRIGGER_NAME AS objectName, EVENT_OBJECT_TABLE AS tableName, SHA2(JSON_ARRAY(TRIGGER_NAME,EVENT_OBJECT_TABLE,EVENT_MANIPULATION,ACTION_TIMING,ACTION_ORDER,REPLACE(ACTION_STATEMENT,CONCAT(CHAR(13),CHAR(10)),CHAR(10))),256) AS digest
 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND (TRIGGER_NAME IN(${triggerNames}) OR EVENT_OBJECT_TABLE IN(${names}))
), pricing_actual AS (
 SELECT 'table' AS kind, objectName, SHA2(GROUP_CONCAT(item ORDER BY item SEPARATOR ''),256) AS digest
 FROM pricing_table_rows GROUP BY objectName
 UNION ALL SELECT 'trigger', objectName, digest FROM pricing_trigger_rows
 UNION ALL SELECT 'view', TABLE_NAME, SHA2(JSON_ARRAY(TABLE_NAME,REPLACE(VIEW_DEFINITION,CONCAT(CHAR(96),DATABASE(),CHAR(96),'.'),''),CHECK_OPTION,IS_UPDATABLE,SECURITY_TYPE),256)
 FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND VIEW_DEFINITION IS NOT NULL
), pricing_expected AS (
 ${expected}
)`;
  const select = `SELECT e.kind, e.objectName, (BINARY e.digest <=> BINARY a.digest) AS matched
FROM pricing_expected e LEFT JOIN pricing_actual a ON a.kind=e.kind AND BINARY a.objectName=BINARY e.objectName
UNION ALL ${unexpected}
UNION ALL SELECT 'session', 'constraint_checks', DATABASE() IS NOT NULL AND @@FOREIGN_KEY_CHECKS=1
 AND @@check_constraint_checks=1 AND @@SESSION.sql_mode NOT LIKE '%NO_BACKSLASH_ESCAPES%'`;
  return { ctes, select };
}

/** @param {unknown} inventory */
export function pricingSchemaSql(inventory) {
  const { ctes, select } = pricingSchemaQuery(inventory);
  return `WITH ${ctes}\n${select}`;
}

/** @param {unknown} inventory */
export function pricingSchemaReportSql(inventory) {
  const { ctes, select } = pricingSchemaQuery(inventory);
  return `WITH ${ctes}, pricing_results AS (${select})
SELECT 'pricing' AS scope, kind, '' AS objectName, COUNT(*) AS requiredCount, SUM(matched) AS matchedCount,
       SUM(matched=0) AS missingOrDifferentCount, 0 AS unverifiedCount
FROM pricing_results GROUP BY kind
UNION ALL SELECT 'pricing', kind, objectName, NULL, NULL, 1, 0
FROM pricing_results WHERE matched=0
ORDER BY kind, objectName`;
}

/** @param {{prepare:(sql:string)=>{all:<T>()=>Promise<{results:T[]}>}}} database
 * @param {unknown} inventory
 */
export async function inspectPricingSchema(database, inventory) {
  if (!isPricingInventory(inventory)) return { ready: false, missing: ['pricing-schema:inventory'] };
  try {
    const { results } = await database.prepare(pricingSchemaSql(inventory)).all();
    return pricingSchemaFindings(results);
  } catch {
    return { ready: false, missing: ['pricing-schema:unavailable'] };
  }
}

/** @param {{kind:string,objectName:string,matched:number}[]} rows */
export function pricingSchemaFindings(rows) {
  const missing = rows.filter(row => row.matched !== 1).map(row => `pricing-schema:${row.kind}:${row.objectName}`);
  if (rows.length !== 69 || new Set(rows.map(row => `${row.kind}:${row.objectName}`)).size !== 69) {
    missing.push('pricing-schema:incomplete');
  }
  return { ready: missing.length === 0, missing };
}
