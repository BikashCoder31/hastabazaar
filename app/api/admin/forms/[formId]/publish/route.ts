import { publishFormDraft } from '@/lib/db/repositories/form-catalog';
import { catalogAdmin, catalogBody, catalogError, catalogFormId, catalogFormMutationDenied, catalogJson, catalogMutationAllowed, catalogMutationInput, catalogNumber, catalogText } from '../../route';

export async function POST(request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const denied = catalogMutationAllowed(request);
  if (denied) return denied;
  try {
    const { actorId, db } = await catalogAdmin();
    const { formId } = await context.params;
    if (!catalogFormId(formId)) return catalogJson({ error: 'Form not found.' }, 404);
    const unavailable = catalogFormMutationDenied(formId);
    if (unavailable) return unavailable;
    const body = await catalogBody(request);
    const common = catalogMutationInput(body);
    const published = await publishFormDraft(db, { formId, actorId, actorRole: 'super_admin', ...common,
      draftId: catalogText(body.draftId), expectedDraftRevision: catalogNumber(body.expectedDraftRevision), now: Date.now() });
    return catalogJson({ published });
  } catch (error) { return catalogError(error); }
}
