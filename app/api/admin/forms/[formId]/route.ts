import { FORM_REGISTRY } from '@/lib/forms/registry';
import { validateFormDraft } from '@/lib/forms/validation';
import { catalogAdmin, catalogError, catalogFormId, catalogJson } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  try {
    const { db } = await catalogAdmin();
    const { formId } = await context.params;
    if (!catalogFormId(formId)) return catalogJson({ error: 'Form not found.' }, 404);
    const rows = await db.prepare(`SELECT id,form_id AS formId,version,revision,status,config_json AS configJson,
      reason,created_by AS createdBy,created_at AS createdAt,updated_by AS updatedBy,
      updated_at AS updatedAt,published_by AS publishedBy,published_at AS publishedAt
      FROM form_config_versions WHERE form_id = ? ORDER BY version DESC,revision DESC`)
      .bind(formId).all<{ configJson: string; [key: string]: unknown }>();
    let versions: { config: unknown; [key: string]: unknown }[];
    try {
      versions = rows.results.map(({ configJson, ...row }) => ({ ...row,
        config: validateFormDraft(formId, JSON.parse(configJson) as unknown),
      }));
    } catch {
      return catalogJson({ error: 'Stored form configuration is unavailable.' }, 503);
    }
    return catalogJson({ form: FORM_REGISTRY[formId], versions });
  } catch (error) { return catalogError(error); }
}
