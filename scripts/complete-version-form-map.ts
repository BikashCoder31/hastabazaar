import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { coreFormContract } from '../lib/forms/core-contracts';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => !entry.isSymbolicLink()).map(async entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  }));
  return nested.flat();
}

const files = (await Promise.all(['app', 'components', 'lib'].map(sources))).flat().sort();
const contents = await Promise.all(files.map(async file => ({ file: file.replaceAll('\\', '/'), lines: (await readFile(file, 'utf8')).split(/\r?\n/) })));
const forms = Object.values(FORM_REGISTRY).sort((a, b) => a.id.localeCompare(b.id)).map(form => ({
  id: form.id,
  audience: form.audience,
  featureRoute: form.route,
  adapter: form.adapterId,
  mode: form.mode,
  editorialManagement: isFormCatalogEditable(form),
  missingPublication: coreFormContract(form.id) ? 'Feature-owned core contract; domain validation and transactional receipt retained' : 'Existing configuration dependency; inspect owning adapter before changing',
  answerStorage: form.capabilities.answerBehavior === 'record' ? ['form_answer_sets', ...(coreFormContract(form.id) ? ['audit_logs:form.core_answers (core only, no custom answers)'] : [])] : [],
  answerBehavior: form.capabilities.answerBehavior,
  allowedCustomTypes: form.capabilities.customFieldTypes,
  nativeFields: form.baseFields,
  literalConsumers: contents.flatMap(source => source.lines.flatMap((line, index) =>
    line.includes(`'${form.id}'`) || line.includes(`"${form.id}"`) ? [{ file: source.file, line: index + 1 }] : [])),
}));
const destination = 'docs/superpowers/plans/2026-11-01-form-consumer-map.json';
await writeFile(destination, JSON.stringify({
  purpose: 'T03 source inventory; no database connection or configuration mutation',
  generatedAt: new Date().toISOString(),
  limitations: 'Literal references are a navigation aid, not a complete dynamic call graph or proof of implemented behavior. Native field rules can be superseded by feature-specific optional intake. Verify each owning journey and regenerate after later tasks.',
  nativeSchemaArtifacts: ['drizzle/0056_form_catalog.sql', 'drizzle/0081_core_form_receipt_retention.sql',
    'deployment/babal/mariadb-schema.sql', 'deployment/babal/mariadb-core-form-receipt-retention.sql'],
  formCount: forms.length,
  nativeFieldCount: forms.reduce((sum, form) => sum + form.nativeFields.length, 0),
  forms,
}, null, 2) + '\n');
console.log(`Mapped ${forms.length} forms and ${forms.reduce((sum, form) => sum + form.nativeFields.length, 0)} native field definitions to ${destination}. No database opened.`);
