import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { commandReceipt } from '@/lib/workflows/contracts';

export type SellerStaffNote = {
  id: string;
  body: string;
  author: string;
  createdAt: number;
  pinned: boolean;
};

export type SellerNoteChange =
  | { action: 'add'; body: string }
  | { action: 'pin'; noteId: string; pinned: boolean };

export class SellerNotesError extends Error {
  constructor(message: string, readonly status = 403) { super(message); }
}

async function notesTableExists(database: D1Database) {
  const maria = (database as D1Database & { dialect?: string }).dialect === 'mariadb';
  const query = maria
    ? "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seller_staff_notes' AND TABLE_TYPE='BASE TABLE'"
    : "SELECT 1 FROM sqlite_master WHERE type='table' AND name='seller_staff_notes'";
  return Boolean(await database.prepare(query).first());
}

/** Called only after the page has authorized the current staff member and seller record. */
export async function listSellerStaffNotes(database: D1Database, sellerId: string): Promise<SellerStaffNote[] | null> {
  if (!(await notesTableExists(database))) return null;

  const { results } = await database.prepare(`SELECT n.id, n.body, u.display_name AS author, n.created_at AS createdAt, n.pinned
    FROM seller_staff_notes n JOIN users u ON u.id=n.author_user_id
    WHERE n.seller_id=? AND HEX(n.seller_id)=HEX(?) ORDER BY n.created_at DESC, n.id DESC`)
    .bind(sellerId, sellerId).all<Omit<SellerStaffNote, 'pinned'> & { pinned: number }>();
  return results.map(note => ({ ...note, pinned: Number(note.pinned) === 1 }));
}

export function parseSellerNoteChange(input: Record<string, unknown>): SellerNoteChange {
  if (input.action === 'add' && typeof input.body === 'string') {
    const body = input.body.trim();
    if (!body || body.length > 2000 || body.includes('\0'))
      throw new SellerNotesError('Enter a private note of 1–2,000 characters.', 400);
    return { action: 'add', body };
  }
  if (input.action === 'pin' && typeof input.noteId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.noteId)
    && typeof input.pinned === 'boolean') {
    return { action: 'pin', noteId: input.noteId, pinned: input.pinned };
  }
  throw new SellerNotesError('Choose a supported note action.', 400);
}

function requireTransactionCondition(database: D1Database, predicate: string, ...values: unknown[]) {
  const id = crypto.randomUUID();
  return [
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`)
      .bind(id, ...values),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}

export async function applySellerNoteChange(database: D1Database, options: {
  actorId: string;
  actorSubject: string;
  sellerId: string;
  requestId: string;
  now: number;
  change: SellerNoteChange;
}) {
  const { actorId, actorSubject, sellerId, requestId, now, change } = options;
  const authority = await staffMutationGuard(database, actorId, 'seller.application.review', SellerNotesError);
  const sellerScope = `SELECT 1 FROM seller_profiles s WHERE s.id=? AND HEX(s.id)=HEX(?) AND HEX(s.user_id)<>HEX(?)
    ${authority.role === 'super_admin' ? '' : `AND NOT EXISTS (
      SELECT 1 FROM seller_participation_profiles p WHERE p.seller_id=s.id AND p.participation_route='managed_maker'
    )`}`;
  const sellerValues = [sellerId, sellerId, actorId];
  if (!(await database.prepare(sellerScope).bind(...sellerValues).first()))
    throw new SellerNotesError('This seller’s notes are unavailable.', 404);
  if (!(await notesTableExists(database)))
    throw new SellerNotesError('Private notes are unavailable.', 404);

  const audit = change.action === 'add' ? { event: 'added', reason: 'Added a private staff note.' }
    : change.pinned ? { event: 'pinned', reason: 'Pinned a private staff note for easy reference.' }
    : { event: 'unpinned', reason: 'Removed a private staff note from pinned notes.' };
  const action = 'seller.note.' + audit.event;
  const context = { actorId, requestId, now, expectedRevision: null };
  const source = { action, subjectType: 'seller', subjectId: sellerId, auditReason: audit.reason };
  const readReceipt = async () => {
    try { return await commandReceipt(database, context, source, { ...change, actorSubject }); }
    catch (error) {
      if (error instanceof Error && error.message === 'Request reference was already used for different command content.')
        throw new SellerNotesError('This request has already been used. Refresh the seller record.', 409);
      throw error;
    }
  };
  const receipt = await readReceipt();
  if (receipt.replayed) return;

  const noteId = change.action === 'add' ? crypto.randomUUID() : change.noteId;
  const noteScope = 'id=? AND HEX(id)=HEX(?) AND seller_id=? AND HEX(seller_id)=HEX(?)';
  const noteValues = [noteId, noteId, sellerId, sellerId];
  if (change.action === 'pin') {
    const note = await database.prepare(`SELECT pinned FROM seller_staff_notes WHERE ${noteScope}`)
      .bind(...noteValues).first<{ pinned: number }>();
    if (!note) throw new SellerNotesError('This note is unavailable.', 404);
    if (Number(note.pinned) === Number(change.pinned))
      throw new SellerNotesError('The pin state changed. Refresh the seller record.', 409);
  }

  const update = change.action === 'add'
    ? database.prepare('INSERT INTO seller_staff_notes(id,seller_id,author_user_id,body,created_at) VALUES(?,?,?,?,?)')
      .bind(noteId, sellerId, actorId, change.body, now)
    : database.prepare(`UPDATE seller_staff_notes SET pinned=? WHERE ${noteScope} AND pinned<>?`)
      .bind(change.pinned ? 1 : 0, ...noteValues, change.pinned ? 1 : 0);

  try {
    await database.batch([
      update,
      ...requireTransactionCondition(database, 'changes()=1'),
      ...requireTransactionCondition(database, `EXISTS(${sellerScope}) AND EXISTS(
        SELECT 1 FROM users WHERE id=? AND HEX(id)=HEX(?) AND HEX(auth_subject)=HEX(?)
      )`, ...sellerValues, actorId, actorId, actorSubject),
      ...authority.statements,
      receipt.insert({ noteId }),
    ]);
  } catch (error) {
    if ((await readReceipt()).replayed) return;
    if (error instanceof Error && /transaction_guards|staff_permission_guards/i.test(error.message))
      throw new SellerNotesError('The seller record or staff access changed. Refresh and try again.', 409);
    throw error;
  }
}
