/** Server-owned context. Callers must recheck current authority inside their domain batch. */
export interface CommandContext {
  actorId: string;
  requestId: string;
  expectedRevision: string | null;
  now: number;
}

export interface OfferSnapshot {
  readonly offerId: string;
  readonly productId: string;
  readonly revision: string;
  readonly selection: readonly { readonly name: string; readonly value: string }[];
  readonly currency: 'NPR';
  readonly sellingPaisa: number;
  readonly compareAtPaisa: number | null;
}

export interface SellerCapabilities {
  dashboard: boolean;
  submitProducts: boolean;
  publicListings: boolean;
  newOrders: boolean;
  payouts: boolean;
  blockers: readonly { capability: string; sourceId: string; reason: string; nextActor: string; href: string | null }[];
}

export interface OperationalEvent {
  eventId: string;
  sourceType: string;
  sourceId: string;
  revision: string;
  kind: string;
  occurredAt: number;
  actorId: string;
}

function identity(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 191) throw new Error('Invalid command identity.');
  return value;
}

/** Deliberately accepts only JSON values; undefined/NaN must not collapse distinct requests. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
  if (typeof value === 'object' && value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  throw new Error('Command payload must contain finite JSON values.');
}

async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

type CommandIdentity = { action: string; subjectType: string; subjectId: string };
type Receipt = { replayed: true; result: unknown } | { replayed: false; insert(result: unknown): D1PreparedStatement };

/**
 * Reuses audit_logs as the command receipt. This does not execute a business operation.
 * The owning repository batches insert() with its revision/permission guards, mutation
 * and notification statements. On a concurrent unique conflict it re-reads this receipt;
 * it must never retry an uncertain external transfer. Time is excluded from retry identity.
 */
export async function commandReceipt(db: D1Database, context: CommandContext, source: CommandIdentity, payload: unknown, nativeFormHealth?:import('../operations/native-form-health').NativeFormProvenance): Promise<Receipt> {
  identity(context.actorId); identity(context.requestId);
  identity(source.action); identity(source.subjectType); identity(source.subjectId);
  if (context.expectedRevision !== null) identity(context.expectedRevision);
  if (!Number.isSafeInteger(context.now) || context.now < 0) throw new Error('Invalid command time.');
  const key = await digest([context.actorId, context.requestId]);
  const commandDigest = await digest([context.actorId, source.action, source.subjectType, source.subjectId, context.expectedRevision, payload]);
  const previous = await db.prepare('SELECT command_digest AS digest,command_result_json AS result FROM audit_logs WHERE command_key=?')
    .bind(key).first<{ digest: string; result: string }>();
  if (previous) {
    if (previous.digest !== commandDigest) throw new Error('Request reference was already used for different command content.');
    return { replayed: true, result: JSON.parse(previous.result) as unknown };
  }
  return { replayed: false, insert(result) {
    if(nativeFormHealth)return db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at,command_key,command_digest,command_result_json,next_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.actorId,source.action,source.subjectType,source.subjectId,
      context.requestId,context.now,key,commandDigest,canonical(result),canonical({nativeFormHealth}));
    return db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,request_id,created_at,command_key,command_digest,command_result_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.actorId, source.action, source.subjectType, source.subjectId,
      context.requestId, context.now, key, commandDigest, canonical(result));
  } };
}

export function captureOfferSnapshot(input: OfferSnapshot): OfferSnapshot {
  identity(input.offerId); identity(input.productId); identity(input.revision);
  if (input.currency !== 'NPR') throw new Error('Unsupported offer currency.');
  for (const amount of [input.sellingPaisa, ...(input.compareAtPaisa === null ? [] : [input.compareAtPaisa])])
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Offer money must be nonnegative safe integer paisa.');
  if (!Array.isArray(input.selection) || input.selection.length > 3) throw new Error('Invalid offer selection.');
  const names = new Set<string>();
  const selection = input.selection.map(option => {
    identity(option.name); identity(option.value);
    if (names.has(option.name)) throw new Error('Duplicate offer option.');
    names.add(option.name);
    return Object.freeze({ name: option.name, value: option.value });
  });
  return Object.freeze({ offerId: input.offerId, productId: input.productId, revision: input.revision,
    currency: input.currency, sellingPaisa: input.sellingPaisa, compareAtPaisa: input.compareAtPaisa,
    selection: Object.freeze(selection) });
}
