import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { connect as connectTls, type TLSSocket } from 'node:tls';

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

export function translateSqliteSql(sql: string): string {
  return sql
    .replace(/\bchanges\(\)/gi, 'ROW_COUNT()')
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
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE')
    .replace(/\s+COLLATE\s+NOCASE\b/gi, '')
    .replace(
      /strftime\('%Y-%m',\s*orders\.delivered_at\s*\/\s*1000,\s*'unixepoch'\)/gi,
      "DATE_FORMAT(FROM_UNIXTIME(orders.delivered_at / 1000), '%Y-%m')",
    )
    // MySQL already treats backslash as the default LIKE escape character.
    .replace(/\s+ESCAPE\s+'\\\\'/gi, '');
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
    if (this.sql.startsWith('/* form-answer-insert */')) {
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
    const formStatements = statements.filter((s) => s.sql.startsWith('/* form-catalog-guard */') || s.sql.startsWith('/* form-answer-insert */'));
    const formIds = [...new Set(formStatements.map((s) => {
      const formId = s.bindings[1];
      if (typeof formId !== 'string' || !formId) throw new Error('Form transaction ID is invalid.');
      return formId;
    }))].sort();
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
      for (const statement of formStatements) {
        if (statement.sql.startsWith('/* form-catalog-guard */')) {
          // Role revocation and account deactivation must settle before the
          // atomic guard, and cannot change between guard and catalog write.
          await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
          await connection.execute('SELECT role FROM user_roles WHERE user_id=? FOR UPDATE', mysqlBindings([statement.bindings[0]]));
        }
      }
      const responses: D1LikeResult<T>[] = [];
      for (const statement of statements) {
        responses.push(await executeStatement<T>(connection, statement.sql, statement.bindings));
      }
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

function objectPath(key: string): string {
  const root = mediaRoot();
  const target = resolve(root, key.replaceAll('\\', '/'));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid media object key.');
  }
  return target;
}

class LocalMediaBucket {
  async put(key: string, value: BodyInit, options: PutOptions = {}) {
    const target = objectPath(key);
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
    const target = objectPath(key);
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
        : Readable.toWeb(createReadStream(objectPath(key), { start: offset, end: offset + length - 1 })),
    };
  }

  async delete(key: string): Promise<void> {
    const target = objectPath(key);
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
    throw new Error(`SMTP server rejected the message (${status || 'unknown'}).`);
  }
}

class SmtpEmailService {
  get configured() {
    return Boolean(
      process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        process.env.SMTP_PASSWORD &&
        process.env.EMAIL_FROM?.trim(),
    );
  }

  async send(message: OutgoingEmail): Promise<void> {
    if (!this.configured) throw new Error('Email delivery is not configured.');
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

    const socket = connectTls({ host, port, servername: host, rejectUnauthorized: true });
    socket.setTimeout(15_000);
    try {
      const reader = await openSmtpSession(socket);
      await smtpCommand(socket, reader, null, [220]);
      await smtpCommand(socket, reader, `EHLO ${process.env.SMTP_HELO?.trim() || 'hastabazaar.com'}`, [250]);
      await smtpCommand(socket, reader, 'AUTH LOGIN', [334]);
      await smtpCommand(socket, reader, Buffer.from(username).toString('base64'), [334]);
      await smtpCommand(socket, reader, Buffer.from(password).toString('base64'), [235]);
      await smtpCommand(socket, reader, `MAIL FROM:<${smtpAddress(from)}>`, [250]);
      await smtpCommand(socket, reader, `RCPT TO:<${smtpAddress(to)}>`, [250, 251]);
      await smtpCommand(socket, reader, 'DATA', [354]);
      await smtpCommand(socket, reader, `${data}\r\n.`, [250]);
      socket.write('QUIT\r\n');
    } catch (error) {
      socket.destroy();
      throw error;
    } finally {
      socket.end();
    }
  }
}

class LocalCaptureEmailService {
  get configured() { return true; }
  async send(message: OutgoingEmail): Promise<void> {
    if (process.env.HASTABAZAAR_RUNTIME_ENV !== 'local_staging') throw new Error('Mail capture is local-staging only.');
    const recipient = message.to.trim().toLowerCase();
    if (!recipient.endsWith('@local.hastabazaar.test')) throw new Error('Local staging mail capture rejected a non-test recipient.');
    const root = resolve(process.cwd(), '.staging', 'mail-capture');
    await mkdir(root, { recursive: true });
    const target = resolve(root, `${Date.now()}-${crypto.randomUUID()}.json`);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('Mail capture path escaped its disposable root.');
    await writeFile(target, `${JSON.stringify({...message,capturedAt:Date.now(),simulationLabel:'SIMULATED — NOT VALID FOR PRODUCTION'},null,2)}\n`, { flag:'wx' });
  }
}

const emailService = process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
  ? new LocalCaptureEmailService()
  : new SmtpEmailService();

export const env = {
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
  get ORDER_EMAIL_JOB_SECRET() {
    return process.env.ORDER_EMAIL_JOB_SECRET;
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
