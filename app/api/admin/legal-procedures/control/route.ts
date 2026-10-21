import { requireLegalDraftApi } from '@/lib/legal-procedures/access';
import { changeLegalProcedureControl, getLegalProcedureControl, getLegalProcedureEvent } from '@/lib/legal-procedures/lifecycle';
import { legalFailure, legalJson, legalQueryNumber, readLegalAction } from '@/lib/legal-procedures/http';
import { LegalDraftValidationError } from '@/lib/legal-procedures/model';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { db } = await requireLegalDraftApi();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['sequence', 'beforeSequence'].includes(key)) ||
      (params.has('sequence') && params.has('beforeSequence'))) throw new LegalDraftValidationError('Unsupported procedure history query.');
    const sequence = legalQueryNumber(params, 'sequence');
    if (sequence !== undefined) {
      const event = await getLegalProcedureEvent(db, sequence);
      return event ? legalJson({ event }) : legalJson({ error: 'That recorded procedure action was not found.' }, 404);
    }
    return legalJson(await getLegalProcedureControl(db, Date.now(), legalQueryNumber(params, 'beforeSequence')));
  } catch (error) { return legalFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { db, actor } = await requireLegalDraftApi();
    const input = await readLegalAction(request), now = Date.now();
    const event = await changeLegalProcedureControl(db, actor, input, now);
    return legalJson({ event, control: await getLegalProcedureControl(db, now) });
  } catch (error) { return legalFailure(error); }
}
