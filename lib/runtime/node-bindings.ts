import { createIsolatedCommercePolicy } from '../security/isolated-commerce-policy';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import { createHostedSecurityPolicy } from '../security/hosted-policy';
import { DeliveryObsolete, MailDeliveryError, type DeliveryContext, type MailDeliveryReceipt } from '../email/delivery-attempts';
import releaseManifest from '../../deployment/babal/release-manifest.json';

import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';

type SqlValue = string | number | boolean | null | ArrayBuffer | Uint8Array;
type Executor = Pool | PoolConnection;

function mysqlBindings(values: SqlValue[]) {
  return values.map((value) =>
    value instanceof ArrayBuffer ? Buffer.from(value) : value,
  );
}

type D1LikeResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: { changes: number; duration: number; last_row_id: number };
};

let pool: Pool | undefined;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Babal.Host runtime.`);
  return value;
}

function databasePool(): Pool {
  if (pool) return pool;
  const port = Number(process.env.DB_PORT ?? '3306');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DB_PORT must be a valid TCP port.');
  }
  pool = mysql.createPool({
    host: requiredEnvironment('DB_HOST'),
    port,
    database: requiredEnvironment('DB_NAME'),
    user: requiredEnvironment('DB_USER'),
    password: requiredEnvironment('DB_PASSWORD'),
    charset: 'utf8mb4',
    // D1 returns JSON as TEXT; keep financial receipts exact for repository parsing.
    jsonStrings: true,
    connectionLimit: Math.max(1, Number(process.env.DB_POOL_SIZE ?? '4')),
    decimalNumbers: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
  return pool;
}

// Translate the new feature expressions as complete tokens. Consuming quoted
// strings and comments prevents text inside them from becoming executable SQL.
function translateFeatureExpressions(sql: string): string {
  return sql.replace(
    /('private\/seller-documents\/'\s*\|\|\s*((?:\w+\.)?seller_id)\s*\|\|\s*'\/')|(json_type\(audit\.next_json,'\$\.catalogDigest'\)='text')|(json_extract\(d\.agreement_snapshot_json,'(\$\.(?:version|settingVersionIds\.(?:account|retention)))'\))|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\/|\b((?:\w+\.)?(?:draft_revision|scheduled_revision|scheduled_for|origin_evidence_reference))\s+IS\s+(NOT\s+)?\?/gi,
    (token, prefix: string | undefined, prefixColumn: string | undefined, digest: string | undefined, extract: string | undefined, path: string | undefined, column: string | undefined, negate: string | undefined) => {
      if (prefix) return `CONCAT(BINARY 'private/seller-documents/', ${prefixColumn}, '/')`;
      if (digest) return "JSON_TYPE(JSON_EXTRACT(audit.next_json,'$.catalogDigest'))='STRING'";
      if (extract) {
        const value = `JSON_EXTRACT(d.agreement_snapshot_json,'${path}')`;
        return `CASE WHEN JSON_TYPE(${value})='NULL' THEN NULL ELSE JSON_UNQUOTE(${value}) END`;
      }
      if (column) return negate ? `NOT (${column} <=> ?)` : `${column} <=> ?`;
      return token;
    },
  );
}

function translateBillingExpressions(sql:string):string {
  return sql.replace(/json_type\(stock_answer\.answers_json,'\$\.productIdentity\.sellerSku'\)='text'|json_extract\((stock_answer\.answers_json),'(\$\.productIdentity\.sellerSku)'\)|json_extract\(((?:d|order_documents|approved)\.snapshot_json),'(\$\.billing\.(?:version|receiptGroups\[\d+\]\.key))'\)|\(seller_profiles\.locality \|\| ', ' \|\| seller_profiles\.municipality \|\| ', ' \|\| seller_profiles\.district \|\| ', ' \|\| seller_profiles\.province \|\| ', Nepal'\)|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\//gi,
    (token,skuColumn:string|undefined,skuPath:string|undefined,documentColumn:string|undefined,documentPath:string|undefined)=>{
      if(token.startsWith('json_type('))return "JSON_TYPE(JSON_EXTRACT(stock_answer.answers_json,'$.productIdentity.sellerSku'))='STRING'";
      if(skuColumn||documentColumn)return `JSON_UNQUOTE(JSON_EXTRACT(${skuColumn??documentColumn},'${skuPath??documentPath}'))`;
      if(token.startsWith('(seller_profiles.locality'))return "CONCAT(seller_profiles.locality, ', ', seller_profiles.municipality, ', ', seller_profiles.district, ', ', seller_profiles.province, ', Nepal')";
      return token;
    });
}

function translateRecoveryExpressions(sql:string):string {
  return sql.replace(/json_extract\(((?:\w+\.)?(?:original_source_json|details_json)),'(\$\.(?:ownerId|customerId|publicMessage))'\)|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\//gi,
    (token,column:string|undefined,path:string|undefined)=>{
      if(!column||!path)return token;
      if(column.endsWith('original_source_json')&&['$.ownerId','$.customerId'].includes(path)||column.endsWith('details_json')&&path==='$.publicMessage')return `JSON_VALUE(${column},'${path}')`;
      return token;
    });
}

function translateClearanceExpressions(sql: string): string {
  // The private object key is byte-sensitive, even under the database's default
  // case-insensitive collation. CONCAT preserves SQLite's NULL propagation.
  return sql.replace(/('private\/managed-clearance-evidence\/'\s*\|\|\s*i\.id\b)|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (token, key: string | undefined) => key ? "CONCAT(BINARY 'private/managed-clearance-evidence/', i.id)" : token);
}

function translateLiveInvoiceExpressions(sql: string): string {
  return sql.replace(/(\?|f\.series_prefix)\s*\|\|\s*'-'\s*\|\|\s*CAST\((next_number|n\.next_number)-1 AS TEXT\)|('hastabazaar:commercial-invoice:'\s*\|\|\s*\?)|'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (token, prefix: string | undefined, sequence: string | undefined, qr: string | undefined) => {
      if(prefix)return `CONCAT(${prefix}, '-', CAST(${sequence}-1 AS CHAR))`;
      if(qr)return "CONCAT('hastabazaar:commercial-invoice:', ?)";
      return token;
    });
}

export function translateSqliteSql(sql: string): string {
  return translateLiveInvoiceExpressions(translateClearanceExpressions(translateRecoveryExpressions(translateBillingExpressions(translateFeatureExpressions(sql)))))
    .replace(/\bchanges\(\)/gi, 'ROW_COUNT()')
    .replace(/\bunixepoch\(\s*'now'\s*\)/gi, 'UNIX_TIMESTAMP()')
    // Exact new claim/redemption empty-field predicates; retain the array type guard.
    .replace(
      /json_type\(v\.config_json,'\$\.fields'\)='array'/g,
      "JSON_TYPE(JSON_EXTRACT(v.config_json,'$.fields'))='ARRAY'",
    )
    .replace(
      /json_array_length\(v\.config_json,'\$\.fields'\)=0/g,
      "JSON_LENGTH(JSON_EXTRACT(v.config_json,'$.fields'))=0",
    )
    .replace(/lower\(hex\(randomblob\(16\)\)\)/gi, "LOWER(REPLACE(UUID(), '-', ''))")
    .replace(/'reward:'\s*\|\|\s*r\.order_id/g, "CONCAT('reward:', r.order_id)")
    .replace(/\bdetail\s*\|\|\s*\?/gi, 'CONCAT(detail, ?)')
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE')
    .replace(/\s+COLLATE\s+NOCASE\b/gi, '')
    .replace(
      /strftime\('%Y-%m',\s*orders\.delivered_at\s*\/\s*1000,\s*'unixepoch'\)/gi,
      "DATE_FORMAT(FROM_UNIXTIME(orders.delivered_at / 1000), '%Y-%m')",
    )
    // MySQL defaults to backslash; accept SQLite and legacy doubled spellings.
    .replace(/\s+ESCAPE\s+'\\{1,2}'/gi, '');
}

function normalizedError(error: unknown): Error {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_DUP_ENTRY'
  ) {
    return new Error(
      `UNIQUE constraint failed: ${(error as { message?: string }).message ?? 'duplicate value'}`,
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function result<T>(
  rows: T[],
  changes: number,
  lastInsertId: number,
  startedAt: number,
): D1LikeResult<T> {
  return {
    results: rows,
    success: true,
    meta: {
      changes,
      duration: Math.max(0, performance.now() - startedAt),
      last_row_id: lastInsertId,
    },
  };
}

async function executeStatement<T>(
  executor: Executor,
  sql: string,
  bindings: SqlValue[],
): Promise<D1LikeResult<T>> {
  const startedAt = performance.now();
  try {
    const [value] = await executor.execute(
      translateSqliteSql(sql),
      mysqlBindings(bindings),
    );
    // SQLite intentionally raises for malformed JSON in failed CASE guards.
    // MariaDB SELECT returns NULL plus a warning instead, so validate the
    // result explicitly. DML warnings also fail closed in non-strict modes.
    const sqliteGuard = /\bELSE\s+json_extract\(\s*'([^']*)'\s*,\s*'\$'\s*\)/i.exec(sql);
    let hasErrorGuard = false;
    if (sqliteGuard) {
      try { JSON.parse(sqliteGuard[1]); } catch { hasErrorGuard = true; }
    }
    if (Array.isArray(value)) {
      if (hasErrorGuard && (value.length !== 1 ||
        Object.values(value[0] as Record<string, unknown>).some((valid) => Number(valid) !== 1))) {
        throw new Error(`Transaction guard rejected the write: ${sqliteGuard?.[1]}.`);
      }
      if (sql.startsWith('/* form-catalog-guard */') && Number((value[0] as { valid?: unknown })?.valid) !== 1) {
        throw new Error('Form catalog transaction guard rejected the write.');
      }
      return result(value as T[], 0, 0, startedAt);
    }
    const header = value as ResultSetHeader;
    if (sql.startsWith('/* core-form-answer-insert */') && header.affectedRows !== 1) {
      throw new Error('The native core answer receipt insert was not confirmed.');
    }
    if (hasErrorGuard && header.warningStatus > 0) {
      throw new Error(`Transaction guard rejected the write: ${sqliteGuard?.[1]}.`);
    }
    return result<T>([], header.affectedRows ?? 0, header.insertId ?? 0, startedAt);
  } catch (error) {
    throw normalizedError(error);
  }
}

function isRateLimitUpsert(sql: string): boolean {
  return (
    /INSERT\s+INTO\s+request_rate_limits/i.test(sql) &&
    /ON\s+CONFLICT\s*\(key\)/i.test(sql) &&
    /RETURNING\s+request_count/i.test(sql)
  );
}

async function executeRateLimitUpsert<T>(
  bindings: SqlValue[],
): Promise<T | null> {
  const connection = await databasePool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO request_rate_limits (\`key\`, request_count, window_started_at, expires_at)
       VALUES (?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         request_count = CASE WHEN expires_at <= ? THEN 1 ELSE request_count + 1 END,
         window_started_at = CASE WHEN expires_at <= ? THEN ? ELSE window_started_at END,
         expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END`,
      mysqlBindings(bindings),
    );
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT request_count AS requestCount, expires_at AS expiresAt FROM request_rate_limits WHERE `key` = ?',
      mysqlBindings([bindings[0]]),
    );
    await connection.commit();
    return (rows[0] as T | undefined) ?? null;
  } catch (error) {
    await connection.rollback();
    throw normalizedError(error);
  } finally {
    connection.release();
  }
}

class MariaDbPreparedStatement {
  readonly sql: string;
  readonly bindings: SqlValue[];

  constructor(sql: string, bindings: SqlValue[] = []) {
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...values: SqlValue[]): MariaDbPreparedStatement {
    return new MariaDbPreparedStatement(this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    if (isRateLimitUpsert(this.sql)) {
      return executeRateLimitUpsert<T>(this.bindings);
    }
    const response = await executeStatement<T>(
      databasePool(),
      this.sql,
      this.bindings,
    );
    return response.results[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1LikeResult<T>> {
    return executeStatement<T>(databasePool(), this.sql, this.bindings);
  }

  async run<T = Record<string, unknown>>(): Promise<D1LikeResult<T>> {
    if (this.sql.startsWith('/* form-answer-insert */') || this.sql.startsWith('/* core-form-answer-insert */')) {
      return (await new MariaDbD1Database().batch<T>([this]))[0];
    }
    return executeStatement<T>(databasePool(), this.sql, this.bindings);
  }
}

class MariaDbD1Database {
  readonly dialect = 'mariadb';
  prepare(sql: string): MariaDbPreparedStatement {
    return new MariaDbPreparedStatement(sql);
  }

  async batch<T = Record<string, unknown>>(
    statements: MariaDbPreparedStatement[],
  ): Promise<D1LikeResult<T>[]> {
    const formStatements = statements.filter((s) => s.sql.startsWith('/* form-catalog-guard */') || s.sql.startsWith('/* form-answer-insert */') || s.sql.startsWith('/* core-form-answer-insert */'));
    const formIds = [...new Set(formStatements.map((s) => {
      const formId = s.bindings[s.sql.startsWith('/* core-form-answer-insert */') ? 2 : 1];
      if (typeof formId !== 'string' || !formId) throw new Error('Form transaction ID is invalid.');
      return formId;
    }))].sort();
    const billingIssuers=[...new Set(statements.filter(s=>s.sql.startsWith('/* billing-issuer-lock */')).map(s=>{
      const issuer=s.bindings[0];
      if(typeof issuer!=='string'||!issuer||issuer.length>191)throw new Error('Billing issuer lock is invalid.');
      return issuer;
    }))].sort();
    // Only explicitly declared legacy-continuity batches enter this protocol.
    // Row locks protect mutable evidence from successful guards through commit.
    const continuityEvidence=statements.filter(s=>s.sql.startsWith('/* commission-continuity-evidence-lock */'));
    const continuitySettings=statements.filter(s=>s.sql.startsWith('/* commission-continuity-setting-lock */'));
    function continuityId(value:SqlValue|undefined,nullable=false):string|null {
      if(nullable&&value===null)return null;
      if(typeof value!=='string'||!value||value.length>191)throw new Error('Continuity lock identity is invalid.');
      return value;
    }
    const continuityUsers=new Set<string>(),continuitySellers=new Set<string>(),continuityAudits=new Set<string>();
    for(const statement of continuityEvidence){
      if(statement.bindings.length!==3)throw new Error('Continuity evidence lock is invalid.');
      continuityUsers.add(continuityId(statement.bindings[0])!);
      const seller=continuityId(statement.bindings[1],true),audit=continuityId(statement.bindings[2],true);
      if(seller)continuitySellers.add(seller);if(audit)continuityAudits.add(audit);
    }
    const continuityKeys=[...new Set(continuitySettings.map(statement=>{
      if(statement.bindings.length!==1)throw new Error('Continuity setting lock is invalid.');
      const key=continuityId(statement.bindings[0])!;
      if(!['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'].includes(key))throw new Error('Continuity setting lock is invalid.');
      return key;
    }))].sort();
    const continuityCutoffs=[...new Set(statements.filter(s=>s.sql.startsWith('/* commission-continuity-cutoff */')).map(statement=>{
      const cutoff=statement.bindings[0];
      if(statement.bindings.length!==1||typeof cutoff!=='number'||!Number.isSafeInteger(cutoff)||cutoff<=0)throw new Error('Continuity cutoff is invalid.');
      return cutoff;
    }))].sort((a,b)=>a-b);
    const connection = await databasePool().getConnection();
    const locks: string[] = [];
    try {
      // Repository guards must see a competing commit after waiting on their
      // row or named locks. Apply this to every atomic D1 batch, including
      // identity and commerce batches that have no configured form answers.
      // SET TRANSACTION is one-shot; pooled session defaults remain unchanged.
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      for (const formId of formIds) {
        // A form may have no rows yet. Named locks cover that empty allocation
        // race and serialize answer acceptance with publication on every worker.
        const key = 'form:' + createHash('sha256').update(requiredEnvironment('DB_NAME') + '\0' + formId).digest('hex').slice(0, 59);
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?,30) AS acquired', [key]);
        if (Number(rows[0]?.acquired) !== 1) throw new Error('Form transaction lock unavailable.');
        locks.push(key);
      }
      for(const issuer of billingIssuers){
        // Cover empty counters as well as existing sequences on every worker.
        // All issuers are locked in sorted order before MAX+1 is evaluated.
        const key='bill:'+createHash('sha256').update(requiredEnvironment('DB_NAME')+'\0'+issuer).digest('hex').slice(0,59);
        const [rows]=await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?,30) AS acquired',[key]);
        if(Number(rows[0]?.acquired)!==1)throw new Error('Billing issuer lock unavailable.');
        locks.push(key);
      }
      for (const statement of formStatements) {
        if (statement.sql.startsWith('/* form-catalog-guard */')) {
          // Role revocation and account deactivation must settle before the
          // atomic guard, and cannot change between guard and catalog write.
          await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
          await connection.execute('SELECT role FROM user_roles WHERE user_id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
        }
      }
      for (const statement of statements.filter(s => s.sql.startsWith('/* seller-commission-lock */'))) {
        // Keep account, role and approval changes outside the acceptance transaction.
        await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
        await connection.execute('SELECT role FROM user_roles WHERE user_id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
        await connection.execute('SELECT id FROM seller_profiles WHERE user_id=? AND id=? FOR UPDATE', mysqlBindings(statement.bindings));
        await connection.execute("SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' FOR UPDATE");
      }
      if(continuityEvidence.length||continuityKeys.length){
        // Supplement writers already acquire this control row. Keep their
        // selection stable alongside the registered seller's legacy evidence.
        await connection.execute("SELECT id FROM commission_control WHERE id='default' FOR UPDATE");
        const users=[...continuityUsers].sort(),sellers=[...continuitySellers].sort();
        for(const id of users)await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[id]);
        for(const id of users)await connection.execute('SELECT role FROM user_roles WHERE user_id=? ORDER BY role FOR UPDATE',[id]);
        for(const id of sellers)await connection.execute('SELECT id FROM seller_profiles WHERE id=? FOR UPDATE',[id]);
        for(const id of sellers)await connection.execute('SELECT seller_id FROM seller_participation_profiles WHERE seller_id=? FOR UPDATE',[id]);
        for(const id of [...continuityAudits].sort())await connection.execute('SELECT id FROM audit_logs WHERE id=? FOR UPDATE',[id]);
        for(const key of continuityKeys)await connection.execute('SELECT id FROM business_setting_versions WHERE setting_key=? ORDER BY id FOR UPDATE',[key]);
      }
      const checkContinuityClock=async()=>{
        for(const cutoff of continuityCutoffs){
          const [rows]=await connection.execute<RowDataPacket[]>('SELECT CASE WHEN UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 < ? THEN 1 ELSE 0 END AS valid',[cutoff]);
          if(Number(rows[0]?.valid)!==1)throw new Error('operation_transaction_guards valid: commission continuity expired; review checkout again.');
        }
      };
      // Pool, named and evidence-lock waits must settle before this clock read.
      if(continuityCutoffs.length)await checkContinuityClock();
      const responses: D1LikeResult<T>[] = [];
      for (const statement of statements) {
        responses.push(await executeStatement<T>(connection, statement.sql, statement.bindings));
      }
      // Later statements can also wait (customer control, inventory, forms).
      // Refuse the entire batch if those waits crossed the exclusive cutoff.
      if(continuityCutoffs.length)await checkContinuityClock();
      await connection.commit();
      return responses;
    } catch (error) {
      await connection.rollback();
      throw normalizedError(error);
    } finally {
      try {
        for (const key of locks.reverse()) await connection.execute('SELECT RELEASE_LOCK(?)', [key]);
        connection.release();
      } catch {
        // Closing the socket releases any remaining named locks. Preserve the
        // committed result or the original rollback error after cleanup.
        connection.destroy();
      }
    }
  }
}

type PutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

function mediaRoot(): string {
  return resolve(
    process.env.MEDIA_ROOT?.trim() || resolve(process.cwd(), 'private-media'),
  );
}

function objectPath(key: string, root = mediaRoot()): string {
  const target = resolve(root, key.replaceAll('\\', '/'));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid media object key.');
  }
  return target;
}

export class LocalMediaBucket {
  constructor(private readonly root = mediaRoot()) {}
  async list(options:{prefix?:string;cursor?:string;limit?:number}={}){
    const limit=options.limit??1000;
    if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('Invalid media page size.');
    const files:string[]=[];
    const walk=async(relative='')=>{
      let entries;try{entries=await readdir(objectPath(relative,this.root),{withFileTypes:true});}catch(error){if(!relative&&(error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
      for(const entry of entries){
        if(entry.isSymbolicLink())throw Error('Media inventory cannot follow symbolic links.');
        const key=relative?relative+'/'+entry.name:entry.name;
        if(entry.isDirectory())await walk(key);else if(entry.isFile())files.push(key);else throw Error('Unsupported media object.');
      }
    };
    await walk();
    const names=new Set(files),keys:string[]=[];
    for(const key of files){
      const sidecar=key.endsWith('.metadata.json')&&names.has(key.slice(0,-14));
      if(sidecar){if(names.has(key+'.metadata.json'))throw Error('Ambiguous media metadata object; review before transfer.');continue;}
      if(!names.has(key+'.metadata.json'))throw Error('Media metadata is missing; a complete transfer cannot be prepared.');
      keys.push(key);
    }
    keys.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
    let after='';if(options.cursor){after=Buffer.from(options.cursor,'base64url').toString('utf8');if(Buffer.from(after).toString('base64url')!==options.cursor)throw Error('Invalid media cursor.');}
    const matching=keys.filter(key=>(!options.prefix||key.startsWith(options.prefix))&&(!after||Buffer.compare(Buffer.from(key),Buffer.from(after))>0));
    const selected=matching.slice(0,limit),objects=[];
    for(const key of selected){const metadata=await this.head(key);if(!metadata)throw Error('A media object changed during inventory.');objects.push(metadata);}
    const truncated=matching.length>selected.length;
    return {objects,truncated,delimitedPrefixes:[],...(truncated?{cursor:Buffer.from(selected[selected.length-1]).toString('base64url')}:{})};
  }
  async put(key: string, value: BodyInit, options: PutOptions = {}) {
    const target = objectPath(key,this.root);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    const body = Buffer.from(await new Response(value).arrayBuffer());
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, body, { flag: 'wx' });
    await rename(temporary, target);
    await writeFile(
      `${target}.metadata.json`,
      JSON.stringify({
        httpMetadata: options.httpMetadata ?? {},
        customMetadata: options.customMetadata ?? {},
        size: body.byteLength,
        etag: createHash('sha256').update(body).digest('hex'),
        uploaded: new Date().toISOString(),
      }),
      'utf8',
    );
    return { key, size: body.byteLength };
  }

  async head(key: string) {
    const target = objectPath(key,this.root);
    try {
      const metadata = JSON.parse(
        await readFile(`${target}.metadata.json`, 'utf8'),
      ) as PutOptions & { uploaded?: string; etag?: string };
      const file = await stat(target);
      const etag = metadata.etag ?? `${file.size.toString(16)}-${file.mtimeMs.toString(16)}`;
      return {
        key,
        size: file.size,
        etag,
        httpEtag: `${metadata.etag ? '' : 'W/'}"${etag}"`,
        uploaded: metadata.uploaded ? new Date(metadata.uploaded) : file.mtime,
        httpMetadata: metadata.httpMetadata ?? {},
        customMetadata: metadata.customMetadata ?? {},
      };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  }

  async get(key: string, options: Pick<R2GetOptions, 'range'> = {}) {
    const object = await this.head(key);
    if (!object) return null;
    const range = options.range;
    if (range instanceof Headers) throw new Error('Use a structured media byte range.');
    let offset = 0;
    let length = object.size;
    if (range) {
      if ('suffix' in range) {
        length = Math.min(range.suffix, object.size);
        offset = object.size - length;
      } else {
        offset = range.offset ?? 0;
        length = Math.min(range.length ?? object.size - offset, object.size - offset);
      }
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0) {
        throw new Error('Invalid media byte range.');
      }
    }
    return {
      ...object,
      ...(range ? { range: { offset, length } } : {}),
      body: object.size === 0
        ? new ReadableStream({ start(controller) { controller.close(); } })
        : Readable.toWeb(createReadStream(objectPath(key,this.root), { start: offset, end: offset + length - 1 })),
    };
  }

  async delete(key: string): Promise<void> {
    const target = objectPath(key,this.root);
    await Promise.all([
      rm(target, { force: true }),
      rm(`${target}.metadata.json`, { force: true }),
    ]);
  }
}

type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function emailHeader(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('Invalid email header.');
  return value;
}

function smtpAddress(value: string): string {
  const match = value.match(/<([^<>]+)>\s*$/);
  return (match?.[1] ?? value).trim();
}

class SmtpReader {
  private buffer = '';
  private waiter?: { resolve: (value: string) => void; reject: (error: Error) => void };
  private failure?: Error;

  constructor(private readonly socket: TLSSocket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      if (this.failure) return;
      this.buffer += String(chunk);
      this.flush();
    });
    socket.on('error', (error) => this.fail(error));
    socket.on('timeout', () => this.fail(new Error('SMTP connection timed out.')));
    socket.on('end', () => this.fail(new Error('SMTP connection ended.')));
    socket.on('close', () => this.fail(new Error('SMTP connection closed.')));
  }

  read(): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.waiter) throw new Error('Concurrent SMTP reads are not supported.');
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
      this.flush();
    });
  }

  private flush() {
    if (!this.waiter) return;
    const lines = this.buffer.split('\r\n');
    for (let index = 0; index < lines.length - 1; index += 1) {
      if (/^\d{3} /.test(lines[index])) {
        const response = lines.slice(0, index + 1).join('\r\n');
        this.buffer = lines.slice(index + 1).join('\r\n');
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter.resolve(response);
        return;
      }
    }
  }

  private fail(error: Error) {
    this.failure ??= error;
    this.buffer = '';
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.reject(this.failure);
    if (!this.socket.destroyed) this.socket.destroy();
  }
}

export async function openSmtpSession(socket: TLSSocket): Promise<SmtpReader> {
  const opening = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off('secureConnect', ready);
      socket.off('error', failed);
      socket.off('timeout', timedOut);
      socket.off('end', ended);
      socket.off('close', closed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
      if (!socket.destroyed) socket.destroy();
    };
    const timedOut = () => failed(new Error('SMTP connection timed out.'));
    const ended = () => failed(new Error('SMTP connection ended before TLS connected.'));
    const closed = () => failed(new Error('SMTP connection closed before TLS connected.'));
    socket.once('secureConnect', ready);
    socket.once('error', failed);
    socket.once('timeout', timedOut);
    socket.once('end', ended);
    socket.once('close', closed);
    if (socket.destroyed) closed();
  });
  // Register the opening failure listeners before the reader can destroy the
  // socket, while still buffering greetings sent immediately after TLS connects.
  const reader = new SmtpReader(socket);
  await opening;
  return reader;
}

class SmtpStatusError extends Error {
  constructor(readonly status: number) { super(`SMTP server rejected the message (${status || 'unknown'}).`); }
}

async function smtpCommand(
  socket: TLSSocket,
  reader: SmtpReader,
  command: string | null,
  expected: readonly number[],
) {
  if (command !== null) socket.write(`${command}\r\n`);
  const response = await reader.read();
  const status = Number(response.slice(0, 3));
  if (!expected.includes(status)) {
    throw new SmtpStatusError(status);
  }
  return response;
}

export class SmtpEmailService {
  constructor(private readonly connectSocket: typeof connectTls = connectTls) {}
  readonly handoffAware = true;
  readonly transport = 'provider' as const;
  get transportKey() { return 'smtp:' + createHash('sha256').update(`${process.env.SMTP_HOST ?? ''}:${process.env.SMTP_PORT ?? '465'}`).digest('hex'); }
  get configurationFingerprint() { return createHash('sha256').update(JSON.stringify([process.env.SMTP_HOST,process.env.SMTP_PORT,process.env.SMTP_HELO,process.env.SMTP_USER,process.env.SMTP_PASSWORD,process.env.EMAIL_FROM,process.env.SMTP_RECIPIENT_ALLOWLIST])).digest('hex'); }
  get configured() {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASSWORD &&
        process.env.EMAIL_FROM?.trim(),
    );
  }

  async probe():Promise<{transport:'provider';available:true}>{
    if(!this.configured)throw new MailDeliveryError('configuration','configuration_invalid',{providerWide:true});
    const host=requiredEnvironment('SMTP_HOST'),port=Number(process.env.SMTP_PORT??'465');
    if(!Number.isInteger(port)||port<1||port>65_535)throw new MailDeliveryError('configuration','configuration_invalid',{providerWide:true});
    const socket=this.connectSocket({host,port,servername:host,rejectUnauthorized:true});socket.setTimeout(15_000);
    let authentication=false;
    try{
      const reader=await openSmtpSession(socket);
      await smtpCommand(socket,reader,null,[220]);
      await smtpCommand(socket,reader,`EHLO ${emailHeader(process.env.SMTP_HELO?.trim()||'hastabazaar.com')}`,[250]);
      authentication=true;
      await smtpCommand(socket,reader,'AUTH LOGIN',[334]);
      await smtpCommand(socket,reader,Buffer.from(requiredEnvironment('SMTP_USER')).toString('base64'),[334]);
      await smtpCommand(socket,reader,Buffer.from(requiredEnvironment('SMTP_PASSWORD')).toString('base64'),[235]);
      authentication=false;
      await smtpCommand(socket,reader,'NOOP',[250]);
      try{socket.write('QUIT\r\n');}catch{/* NOOP result is already observed. */}
      return{transport:'provider',available:true};
    }catch(error){
      socket.destroy();
      if(error instanceof MailDeliveryError)throw error;
      const configuration=error instanceof SmtpStatusError&&error.status>=500;
      throw new MailDeliveryError(configuration?'configuration':'temporary',configuration?(authentication?'authentication_rejected':'configuration_invalid'):'provider_unavailable',{providerWide:true});
    }finally{try{socket.end();}catch{/* Best effort cleanup. */}}
  }

  async send(message: OutgoingEmail, context?: DeliveryContext): Promise<MailDeliveryReceipt> {
    try { return await this.deliver(message,context); } catch(error) {
      if(error instanceof MailDeliveryError || error instanceof DeliveryObsolete) throw error;
      throw new MailDeliveryError('configuration','configuration_invalid',{providerWide:true},error instanceof Error ? error.message : 'Email configuration is invalid.');
    }
  }

  private async deliver(message: OutgoingEmail, context?: DeliveryContext): Promise<MailDeliveryReceipt> {
    if (!this.configured) throw new Error('Email delivery is not configured.');
    const allowlist = process.env.SMTP_RECIPIENT_ALLOWLIST;
    if (allowlist !== undefined || process.env.APP_ORIGIN === 'https://staging.hastabazaar.com') {
      let recipients: unknown;
      try { recipients = JSON.parse(allowlist ?? ''); } catch { /* Fail closed below. */ }
      if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > 64 ||
        recipients.some((recipient) => typeof recipient !== 'string' ||
          !/^[a-z0-9.!#$%&'+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(recipient))) {
        throw new Error('SMTP recipient allowlist is invalid.');
      }
      if (!recipients.some((recipient: string) => recipient.toLowerCase() === message.to.trim().toLowerCase())) {
        throw new MailDeliveryError('configuration','configuration_invalid',{},'SMTP recipient is not permitted.');
      }
    }
    const host = requiredEnvironment('SMTP_HOST');
    const port = Number(process.env.SMTP_PORT ?? '465');
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('SMTP_PORT must be a valid TCP port.');
    }
    const username = requiredEnvironment('SMTP_USER');
    const password = requiredEnvironment('SMTP_PASSWORD');
    const from = requiredEnvironment('EMAIL_FROM');
    const to = emailHeader(message.to);
    const subject = emailHeader(message.subject);
    const boundary = `hastabazaar-${crypto.randomUUID()}`;
    const data = [
      `From: ${emailHeader(from)}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      ...(context ? [`Message-ID: ${emailHeader(context.messageId)}`] : []),
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      `--${boundary}--`,
      '',
    ]
      .join('\r\n')
      .replace(/(^|\r\n)\./g, '$1..');

    const socket = this.connectSocket({ host, port, servername: host, rejectUnauthorized: true });
    socket.setTimeout(15_000);
    let phase: 'connect'|'authentication'|'recipient'|'data'|'submitted' = 'connect';
    let accepted: MailDeliveryReceipt | undefined;
    try {
      const reader = await openSmtpSession(socket);
      await smtpCommand(socket, reader, null, [220]);
      await smtpCommand(socket, reader, `EHLO ${emailHeader(process.env.SMTP_HELO?.trim() || 'hastabazaar.com')}`, [250]);
      phase='authentication';
      await smtpCommand(socket, reader, 'AUTH LOGIN', [334]);
      await smtpCommand(socket, reader, Buffer.from(username).toString('base64'), [334]);
      await smtpCommand(socket, reader, Buffer.from(password).toString('base64'), [235]);
      phase='recipient';
      await smtpCommand(socket, reader, `MAIL FROM:<${smtpAddress(from)}>`, [250]);
      await smtpCommand(socket, reader, `RCPT TO:<${smtpAddress(to)}>`, [250, 251]);
      phase='data';
      await smtpCommand(socket, reader, 'DATA', [354]);
      try { await context?.beforeHandoff(); } catch(error) {
        if(error instanceof DeliveryObsolete) throw error;
        throw new MailDeliveryError('temporary','delivery_failed');
      }
      phase='submitted';
      const response=await smtpCommand(socket, reader, `${data}\r\n.`, [250]);
      accepted={outcome:'accepted',transport:'provider',receipt:createHash('sha256').update(response).digest('hex')};
      try { socket.write('QUIT\r\n'); } catch { /* DATA250 already proves acceptance. */ }
      return accepted;
    } catch (error) {
      socket.destroy();
      if(accepted) return accepted;
      if(error instanceof MailDeliveryError || error instanceof DeliveryObsolete) throw error;
      if(error instanceof SmtpStatusError) {
        const temporary=error.status>=400&&error.status<500;
        throw new MailDeliveryError(temporary?'temporary':phase==='recipient'?'permanent_recipient':'configuration',temporary?'provider_unavailable':phase==='authentication'?'authentication_rejected':phase==='recipient'?'recipient_rejected':'configuration_invalid',{providerWide:phase==='authentication'||(temporary&&error.status===421)});
      }
      throw new MailDeliveryError(phase==='submitted'?'unknown':'temporary',phase==='submitted'?'outcome_uncertain':'provider_unavailable',{providerWide:phase!=='submitted'});
    } finally {
      try { socket.end(); } catch { /* Cleanup does not undo acceptance. */ }
    }
  }
}

export class LocalCaptureEmailService {
  constructor(private readonly checkCaptureDirectory:()=>Promise<void>=async()=>{
    const root=resolve(process.cwd(),'.staging','mail-capture');
    await mkdir(root,{recursive:true});
    if(!(await stat(root)).isDirectory())throw new Error('Capture directory unavailable');
    await access(root,fsConstants.W_OK);
  }){}
  readonly handoffAware=true;
  readonly transport='capture' as const;
  readonly transportKey='local-capture';
  readonly configurationFingerprint='local-staging-capture-v1';
  get configured() { return true; }
  async readIsolatedCaptureOrigin(): Promise<string | undefined> {
    if (!process.env.HASTABAZAAR_COMMERCE_POLICY_FILE) return undefined;
    const environment = { ...process.env };
    if (environment.HATSKALA_STAGING_NATIVE === '1') throw new Error('Isolated capture requires the package child.');
    const policy = createIsolatedCommercePolicy(environment, env.DB);
    if (await policy.read() !== true) throw new Error('Isolated capture policy was not initialized.');
    return environment.APP_ORIGIN;
  }
  async probe():Promise<{transport:'capture';available:true}>{
    if(process.env.HASTABAZAAR_RUNTIME_ENV!=='local_staging'||process.env.HATSKALA_STAGING_NATIVE==='1')throw new MailDeliveryError('configuration','configuration_invalid');
    try{await this.checkCaptureDirectory();}catch{throw new MailDeliveryError('temporary','provider_unavailable');}
    return{transport:'capture',available:true};
  }
  async send(message: OutgoingEmail, context?: DeliveryContext): Promise<MailDeliveryReceipt> {
    if (process.env.HASTABAZAAR_RUNTIME_ENV !== 'local_staging') throw new Error('Mail capture is local-staging only.');
    if (process.env.HATSKALA_STAGING_NATIVE === '1') throw new Error('Native verification cannot dispatch or capture email in the retained local project.');
    const recipient = message.to.trim().toLowerCase();
    if (!recipient.endsWith('@local.hastabazaar.test')) throw new Error('Local staging mail capture rejected a non-test recipient.');
    const root = resolve(process.cwd(), '.staging', 'mail-capture');
    await mkdir(root, { recursive: true });
    const target = resolve(root, `${Date.now()}-${crypto.randomUUID()}.json`);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('Mail capture path escaped its disposable root.');
    await context?.beforeHandoff();
    await writeFile(target, `${JSON.stringify({...message,messageId:context?.messageId,deliveryId:context?.deliveryId,attemptId:context?.attemptId,capturedAt:Date.now(),simulationLabel:'SIMULATED — NOT VALID FOR PRODUCTION'},null,2)}\n`, { flag:'wx' });
    return {outcome:'captured',transport:'capture',receipt:context?.attemptId??target.slice(root.length+1)};
  }
}

const emailService = process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
  ? new LocalCaptureEmailService()
  : new SmtpEmailService();

export const env = {
  get SECURITY_POLICY(): ReturnType<typeof createIsolatedCommercePolicy> | undefined {
    if (process.env.HASTABAZAAR_COMMERCE_POLICY_FILE) return createIsolatedCommercePolicy(process.env, env.DB);
    return process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging' ? undefined : createHostedSecurityPolicy({
      HASTABAZAAR_RUNTIME_ENV: process.env.HASTABAZAAR_RUNTIME_ENV,
      HASTABAZAAR_SECURITY_KEY: process.env.HASTABAZAAR_SECURITY_KEY,
      HASTABAZAAR_SECURITY_POLICY_ROOT: process.env.HASTABAZAAR_SECURITY_POLICY_ROOT,
      APP_ORIGIN: process.env.APP_ORIGIN, MEDIA_ROOT: process.env.MEDIA_ROOT,
    });
  },
  get HASTABAZAAR_SECURITY_KEY() {
    return process.env.HASTABAZAAR_SECURITY_KEY;
  },
  DB: new MariaDbD1Database() as unknown as D1Database,
  MEDIA: new LocalMediaBucket() as unknown as R2Bucket,
  EMAIL: emailService,
  get EMAIL_DELIVERY_CONFIGURED() {
    return emailService.configured ? 'true' : 'false';
  },
  get APP_ORIGIN() {
    return process.env.APP_ORIGIN;
  },
  get HASTABAZAAR_RUNTIME_ENV() {
    return process.env.HASTABAZAAR_RUNTIME_ENV;
  },
  get CONTACT_DAILY_SEND_LIMIT() {
    return process.env.CONTACT_DAILY_SEND_LIMIT;
  },
  get CHECKOUT_CONTACT_POLICY() {
    return process.env.CHECKOUT_CONTACT_POLICY;
  },
  get NCM_API_BASE_URL() {
    return process.env.NCM_API_BASE_URL;
  },
  get NCM_API_TOKEN() {
    return process.env.NCM_API_TOKEN;
  },
  get NCM_WEBHOOK_KEY() {
    return process.env.NCM_WEBHOOK_KEY;
  },
  get ORDER_EMAIL_JOB_SECRET() {
    return process.env.ORDER_EMAIL_JOB_SECRET;
  },
  get EMAIL_AUTOMATION_EXPECTED_SINCE() {
    return process.env.EMAIL_AUTOMATION_EXPECTED_SINCE;
  },
  get EMAIL_WATCHDOG_SECRET() {
    return process.env.EMAIL_WATCHDOG_SECRET;
  },
  get HASTABAZAAR_RELEASE_ID() {
    // The hosted build selects the same manifest used by /health.
    return releaseManifest.release;
  },
  get SYSTEM_HEALTH_JOB_SECRET() {
    return process.env.SYSTEM_HEALTH_JOB_SECRET;
  },
  get SYSTEM_HEALTH_EXPECTED_SINCE() {
    return process.env.SYSTEM_HEALTH_EXPECTED_SINCE;
  },
  get GOOGLE_CLIENT_ID() {
    return process.env.GOOGLE_CLIENT_ID;
  },
  get GOOGLE_CLIENT_SECRET() {
    return process.env.GOOGLE_CLIENT_SECRET;
  },
  // Expose only the staff configuration the application expects as bindings.
  // Read it at runtime so cPanel changes take effect without rebuilding.
  get HASTABAZAAR_SUPER_ADMIN_EMAIL() {
    return process.env.HASTABAZAAR_SUPER_ADMIN_EMAIL;
  },
  get HASTABAZAAR_ADMIN_EMAIL() {
    return process.env.HASTABAZAAR_ADMIN_EMAIL;
  },
  get HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL() {
    return process.env.HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL;
  },
  get HASTABAZAAR_STAGING_ADMIN_EMAIL() {
    return process.env.HASTABAZAAR_STAGING_ADMIN_EMAIL;
  },
};
