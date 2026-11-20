import { FormCompatibilityError, getFormCompatibility, setFormCompatibility } from '@/lib/forms/compatibility';
import { CatalogClientInputError, catalogAdmin, catalogBody, catalogError, catalogFormId, catalogFormMutationDenied,
  catalogJson, catalogMutationAllowed, catalogReviewMutationInput, catalogNumber, catalogText } from '../../route';

function failure(error: unknown) {
  if (error instanceof FormCompatibilityError || (error instanceof Error && error.message === 'Request reference was already used for different command content.'))
    return catalogJson({ error: error.message }, 409);
  return catalogError(error);
}

export async function GET(request: Request, context: { params: Promise<{ formId: string }> }) {
  try {
    const { db,actorId } = await catalogAdmin(request);
    const { formId } = await context.params;
    if (!catalogFormId(formId)) return catalogJson({ error: 'Form not found.' }, 404);
    const version = catalogNumber(Number(new URL(request.url).searchParams.get('version')));
    const policy=await getFormCompatibility(db,formId,version,Date.now());
    await catalogAdmin(request,actorId);
    return catalogJson({policy});
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: { params: Promise<{ formId: string }> }) {
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
    if (body.mode !== 'review_equivalent' && body.mode !== 'require_current') throw new CatalogClientInputError('Choose a compatibility action.');
    const policy = await setFormCompatibility(db, { ...common, actorId, formId, mode: body.mode,
      fromVersion: common.expectedPublishedVersion - 1, toVersion: common.expectedPublishedVersion,
      expectedRevision: catalogText(body.versionId), now: Date.now() });
    return catalogJson({ policy });
  } catch (error) { return failure(error); }
}
