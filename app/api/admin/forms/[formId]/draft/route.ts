import { saveFormDraft } from '@/lib/db/repositories/form-catalog';
import { catalogAdmin, catalogBody, catalogError, catalogFormId, catalogJson, catalogMutationAllowed, catalogMutationInput, catalogNumber, catalogText } from '../../route';

export async function POST(request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const denied = catalogMutationAllowed(request);
  if (denied) return denied;
  try {
    const { actorId, db } = await catalogAdmin();
    const { formId } = await context.params;
    if (!catalogFormId(formId)) return catalogJson({ error: 'Form not found.' }, 404);
    const body = await catalogBody(request);
    const common = catalogMutationInput(body);
    const draftId = body.draftId === undefined ? undefined : catalogText(body.draftId);
    const expectedDraftRevision = draftId === undefined ? undefined : catalogNumber(body.expectedDraftRevision);
    const draft = await saveFormDraft(db, { formId, actorId, actorRole: 'super_admin', ...common,
      config: body.config as never, draftId, expectedDraftRevision, now: Date.now() });
    return catalogJson({ draft }, draftId ? 200 : 201);
  } catch (error) { return catalogError(error); }
}
