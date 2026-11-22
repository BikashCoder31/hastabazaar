import { requireLegalProcedureReaderApi } from '@/lib/legal-procedures/access';
import { getLegalProcedureControl } from '@/lib/legal-procedures/lifecycle';
import { legalFailure, legalJson } from '@/lib/legal-procedures/http';
import { LegalDraftValidationError } from '@/lib/legal-procedures/model';
import { operatingDocumentText } from '@/lib/legal-procedures/document';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { db } = await requireLegalProcedureReaderApi();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'download') || (params.has('download') &&
      (params.getAll('download').length !== 1 || params.get('download') !== '1'))) throw new LegalDraftValidationError('Unsupported active procedure request.');
    const { active } = await getLegalProcedureControl(db, Date.now());
    if (!params.has('download')) return legalJson({ active });
    if (!active) return legalJson({ error: 'No internal procedure is active. Ask Super Admin to activate an approved version.' }, 404);
    return new Response(operatingDocumentText(active), { headers: { 'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="hastabazaar-operating-procedure-v${active.document.revision}.txt"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return legalFailure(error); }
}
