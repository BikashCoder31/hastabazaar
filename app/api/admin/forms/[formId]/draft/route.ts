import { assertRetainedExtensionConfig } from '@/lib/forms/retained-extensions';
import { saveFormDraft } from '@/lib/db/repositories/form-catalog';
import { FormValidationError, validateFormDraft } from '@/lib/forms/validation';
import { CatalogClientInputError, catalogAdmin, catalogBody, catalogError, catalogFormId, catalogFormMutationDenied, catalogJson, catalogMutationAllowed, catalogReviewMutationInput, catalogNumber, catalogText } from '../../route';

export async function POST(request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const denied = catalogMutationAllowed(request);
  if (denied) return denied;
  try {
    const { actorId, db } = await catalogAdmin(request);
    const { formId } = await context.params;
    if (!catalogFormId(formId)) return catalogJson({ error: 'Form not found.' }, 404);
    const unavailable = catalogFormMutationDenied(formId, request);
    if (unavailable) return unavailable;
    const body = await catalogBody(request);
    const common = catalogReviewMutationInput(body, formId, actorId);
    const draftId = body.draftId === undefined ? undefined : catalogText(body.draftId);
    const expectedDraftRevision = draftId === undefined ? undefined : catalogNumber(body.expectedDraftRevision);
    let config;
    try { config = validateFormDraft(formId, body.config); }
    catch (error) {
      if (error instanceof FormValidationError) throw new CatalogClientInputError(error.message);
      throw error;
    }
    await assertRetainedExtensionConfig(db, formId, config);
    const draft = await saveFormDraft(db, { formId, actorId, actorRole: 'super_admin', ...common,
      config, draftId, expectedDraftRevision, now: Date.now() });
    return catalogJson({ draft }, draftId ? 200 : 201);
  } catch (error) { return catalogError(error); }
}
