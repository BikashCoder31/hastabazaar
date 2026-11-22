import { assertRetainedExtensionVersion } from '@/lib/forms/retained-extensions';
import { restoreFormVersion } from '@/lib/db/repositories/form-catalog';
import { catalogAdmin, catalogBody, catalogError, catalogFormId, catalogFormMutationDenied, catalogJson, catalogMutationAllowed, catalogReviewMutationInput, catalogNumber } from '../../route';

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
    await assertRetainedExtensionVersion(db, formId, { sourceVersion: catalogNumber(body.sourceVersion) });
    const published = await restoreFormVersion(db, { formId, actorId, actorRole: 'super_admin', ...common,
      sourceVersion: catalogNumber(body.sourceVersion), now: Date.now() });
    return catalogJson({ published });
  } catch (error) { return catalogError(error); }
}
