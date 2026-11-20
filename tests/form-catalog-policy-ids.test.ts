import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { resolveFormPolicyIds } from './helpers/form-policy-ids';

function ids(source: string): readonly string[] | null {
  const ast = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result: readonly string[] | null = null;
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'data-form-id')
      result = resolveFormPolicyIds(node.initializer, ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}

void test('policy resolves only statically declared form IDs in the actual lexical scope', () => {
  assert.deepEqual(ids('export const Form=()=> <form data-form-id="account.profile"/>'), ['account.profile']);
  assert.deepEqual(ids('const FORM_ID="account.profile"; export const Form=()=> <form data-form-id={FORM_ID}/>'), ['account.profile']);
  assert.deepEqual(ids('export function Form(){const FORM_ID="account.profile";return <form data-form-id={FORM_ID}/>;}'), ['account.profile']);
  assert.deepEqual(ids('const FORM_ID="account.profile"; export function Form(){const FORM_ID="account.address";return <form data-form-id={FORM_ID}/>;}'), ['account.address']);
  assert.deepEqual(ids('export const Form=({mode})=> <form data-form-id={mode ? "public.contact" : "public.feedback"}/>'), ['public.contact','public.feedback']);
  assert.deepEqual(ids('const CONTACT="public.contact";const FEEDBACK="public.feedback";export const Form=({mode})=> <form data-form-id={mode ? CONTACT : FEEDBACK}/>'), ['public.contact','public.feedback']);
  assert.deepEqual(ids('export function Form({issue}){const formId=issue?"commerce.gift-card-issue":"commerce.gift-card-redeem";return <form data-form-id={formId}/>;}'), ['commerce.gift-card-issue','commerce.gift-card-redeem']);
  assert.deepEqual(ids('export function Form({mode}){const formId=mode===1?"public.contact":mode===2?"public.feedback":"public.contact";return <form data-form-id={formId}/>;}'), ['public.contact','public.feedback']);
});

void test('policy rejects mutable, imported, computed and shadowed unknown IDs', () => {
  for (const source of [
    'let FORM_ID="account.profile";export const Form=()=> <form data-form-id={FORM_ID}/>',
    'import {FORM_ID} from "./unknown";export const Form=()=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID=chooseId();export const Form=()=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID="account.profile";export const Form=({FORM_ID})=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID="account.profile";export function Form(FORM_ID:string){return <form data-form-id={FORM_ID}/>;}',
    'const FORM_ID="account.profile";export function Form(){let FORM_ID="account.address";return <form data-form-id={FORM_ID}/>;}',
    'const FORM_ID="account.profile";const ALIAS=FORM_ID;export const Form=()=> <form data-form-id={ALIAS}/>',
    'export const Form=({mode,id})=> <form data-form-id={mode ? "public.contact" : id}/>',
    'export const Form=()=> <form data-form-id={unknownId}/>',
    'const FORM_ID=mode?"public.contact":undefined;export const Form=()=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID=mode?"public.contact":FORM_ID;export const Form=()=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID=mode?"public.contact":OTHER;const OTHER=FORM_ID;export const Form=()=> <form data-form-id={FORM_ID}/>',
    'const FORM_ID=mode?"public.contact":OTHER;const OTHER=mode?"public.feedback":FORM_ID;export const Form=()=> <form data-form-id={FORM_ID}/>',
  ]) assert.equal(ids(source), null, source);
});
