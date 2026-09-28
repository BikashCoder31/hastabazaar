import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { resolveFormPolicyIds } from './form-policy-ids';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../../lib/forms/registry';
import type { FormDefinition, FormId } from '../../lib/forms/types';

export interface FormSourceSite {
  readonly path: string;
  readonly ordinal: number;
  readonly line: number;
  readonly fingerprint: string;
  readonly formId: string | null;
  readonly formIds?: readonly string[];
}

export interface FormPolicyViolation {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

// Exact pre-integration source sites. Keep each path, ordinal and full-form
// fingerprint frozen; adding a form or changing one requires an explicit review.
// The final column names its inventory definition, never a live adapter.
const FROZEN_BASELINE = ``.trim();

const baseline = new Map(FROZEN_BASELINE.split('\n').filter(Boolean).map((row) => {
  const [path, ordinal, fingerprint, id] = row.split('|');
  return [`${path}|${ordinal}|${fingerprint}`, id] as const;
}));

async function sourceFiles(root: string, directory: string): Promise<string[]> {
  const current = join(root, directory);
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(root, child));
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) files.push(child);
  }
  return files;
}

export async function collectFormSites(root: string): Promise<FormSourceSite[]> {
  const files = [...await sourceFiles(root, 'app'), ...await sourceFiles(root, 'components')].sort();
  const sites: FormSourceSite[] = [];
  for (const file of files) {
    const source = await readFile(join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
    let ordinal = 0;
    function visit(node: ts.Node): void {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'form') {
        ordinal += 1;
        const idAttribute = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'data-form-id');
        const initializer = idAttribute && ts.isJsxAttribute(idAttribute) ? idAttribute.initializer : undefined;
        const formIds = resolveFormPolicyIds(initializer, ast);
        const formId = formIds?.length === 1 ? formIds[0] : null;
        const formSource = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)
          ? node.parent.getText(ast)
          : node.getText(ast);
        sites.push({ path: file.replaceAll('\\', '/'), ordinal, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, fingerprint: createHash('sha256').update(formSource).digest('hex').slice(0, 16), formId, ...(formIds ? { formIds } : {}) });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return sites;
}

export async function scanFormSites(root: string, registry: Readonly<Record<FormId, FormDefinition>> = FORM_REGISTRY): Promise<FormPolicyViolation[]> {
  const violations: FormPolicyViolation[] = [];
  function hasImplementedAdapter(definition: FormDefinition): boolean {
    const adapter = IMPLEMENTED_FORM_ADAPTERS[definition.adapterId];
    return Boolean(adapter && adapter.formId === definition.id && adapter.route === definition.route && adapter.mode === definition.mode);
  }
  for (const site of await collectFormSites(resolve(root))) {
    const frozenId = baseline.get(`${site.path}|${site.ordinal}|${site.fingerprint}`);
    const ids = site.formIds ?? (frozenId ? [frozenId] : []);
    if (!ids.length || ids.some((id) => !registry[id])) {
      violations.push({ path: site.path, line: site.line, reason: 'Unregistered form site' });
    } else if (frozenId && site.formIds && (site.formIds.length !== 1 || site.formIds[0] !== frozenId)) {
      violations.push({ path: site.path, line: site.line, reason: `Form ID ${site.formId} does not match frozen site ${frozenId}` });
    } else if (!frozenId) {
      for (const id of ids) {
        if (registry[id].adapterId.startsWith('pending:'))
          violations.push({ path: site.path, line: site.line, reason: `Unregistered future form ${id} cannot use a pending adapter` });
        else if (!hasImplementedAdapter(registry[id]))
          violations.push({ path: site.path, line: site.line, reason: `Form ${id} has no registered implemented adapter` });
      }
    }
  }
  for (const [id, definition] of Object.entries(registry)) {
    if (!definition.adapterId?.trim() || !definition.capabilities?.explanation?.trim()) violations.push({ path: 'lib/forms/registry.ts', line: 0, reason: `${id} requires an adapter and capability explanation` });
    else if (!definition.adapterId.startsWith('pending:') && !hasImplementedAdapter(definition)) violations.push({ path: 'lib/forms/registry.ts', line: 0, reason: `${id} has no registered implemented adapter` });
  }
  return violations;
}
