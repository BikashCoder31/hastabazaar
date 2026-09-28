import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS, PROGRAMMATIC_FORM_SITES } from '../lib/forms/registry';
import { collectFormSites, scanFormSites } from './helpers/form-policy';
import { validateFormDraft } from '../lib/forms/validation';

const root = resolve(import.meta.dirname, '..');

void test('complete rollout has no pending adapter or unidentified rendered form', async () => {
  assert.deepEqual(Object.values(FORM_REGISTRY).filter((definition) => definition.adapterId.startsWith('pending:')).map((definition) => definition.id), []);
  const sites = await collectFormSites(root);
  assert.ok(sites.length >= 69, 'Historical approved inventory is a lower bound, not a frozen exemption');
  assert.deepEqual(sites.filter((site) => !site.formIds?.length).map((site) => `${site.path}:${site.line}`), []);
  assert.deepEqual(await scanFormSites(root), []);
  const policy = await readFile(resolve(root, 'tests/helpers/form-policy.ts'), 'utf8');
  const frozen = policy.match(/const FROZEN_BASELINE = `([\s\S]*?)`\.trim\(\)/);
  assert.ok(frozen, 'The explicit historical exception ledger must remain inspectable');
  assert.equal(frozen[1].trim(), '', 'All historical exceptions must be exhausted');
});

void test('every discovered click-driven entry surface has an exact implemented adapter and explicit behavior', async () => {
  for (const site of PROGRAMMATIC_FORM_SITES) {
    const source = await readFile(resolve(root, site.path), 'utf8');
    assert.ok(site.explanation.trim());
    for (const id of site.formIds) {
      const definition = FORM_REGISTRY[id];
      assert.equal(definition.adapterId, id, id);
      assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[id], { formId: id, route: definition.route, mode: definition.mode }, id);
      assert.ok(source.includes(id), `${id} must identify the actual source surface`);
      assert.equal(definition.capabilities.answerBehavior, id === 'commerce.add-to-cart' ? 'none' : 'record', id);
    }
  }
});

void test('cart and local-role controls retain explicit protected no-answer capabilities', () => {
  for (const id of ['commerce.add-to-cart', 'system.local-testing-role']) {
    const definition = FORM_REGISTRY[id];
    assert.equal(definition.adapterId, id);
    assert.equal(definition.capabilities.answerBehavior, 'none');
    assert.deepEqual(definition.capabilities.customFieldTypes, []);
    assert.ok(definition.baseFields.every((field) => field.capability === 'protected'));
    assert.throws(() => validateFormDraft(id, {formId:id,fields:[{id:'extra_context',key:'extra_context',type:'short_text',label:'Extra',required:false,status:'active',order:0}]}));
  }
});

void test('no recording adapter permits adding protected authorization, upload, money or identity controls', () => {
  for (const definition of Object.values(FORM_REGISTRY).filter((form) => form.capabilities.answerBehavior === 'record')) {
    for (const key of [...definition.baseFields.filter((field) => field.capability === 'protected').map((field) => field.key), 'password', 'receiptToken']) {
      assert.throws(() => validateFormDraft(definition.id, {formId:definition.id,fields:[{
        id:key,key,type:'short_text',label:'Forged system field',required:false,status:'active',order:0,
      }]}), `${definition.id} must reject ${key}`);
    }
  }
});
