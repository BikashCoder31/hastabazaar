import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft, validateAnswersForDefinition } from '../lib/forms/validation';

const recordingIds=['commerce.order-cancellation','staff.return-case-action','staff.complaint-case-action',
  'staff.cancellation-review','staff.seller-review-action','staff.homepage-hero-manager','staff.homepage-occasion-manager',
  'staff.business-settings-manager','staff.homepage-visibility','staff.order-fulfillment','staff.review-moderation',
  'staff.seller-governance','staff.product-review'];
void test('all thirteen actual recording adapters accept required safe context and protect domain aliases',()=>{
  for(const formId of recordingIds){
    const definition=FORM_REGISTRY[formId];assert.equal(definition.adapterId,formId);assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.route,definition.route);
    assert.equal(definition.capabilities.answerBehavior,'record');
    const draft=validateFormDraft(formId,{formId,fields:[{id:'review_context',key:'review_context',type:'short_text',
      label:'Review context',required:true,order:0,status:'active'}]});
    assert.throws(()=>validateAnswersForDefinition(definition,{...draft,version:1,publishedAt:1},[]));
    assert.equal(validateAnswersForDefinition(definition,{...draft,version:1,publishedAt:1},[{fieldId:'review_context',value:'Fictional reviewed evidence'}]).answers.length,1);
    for(const base of definition.baseFields)for(const key of [base.key,base.key.replace(/[A-Z]/g,letter=>'_'+letter.toLowerCase())])
      assert.throws(()=>validateFormDraft(formId,{formId,fields:[{id:key,key,type:'short_text',label:'Protected value',required:true,order:0,status:'active'}]}),formId+':'+key);
  }
});
void test('all recording definitions accept each supported scalar type and protect actual nested homepage controls',()=>{
  const examples = [
    ['short_text','Fictional context'],['long_text','Fictional longer context'],['number',12],
    ['date','2026-09-28'],['single_choice','checked'],['multiple_choice',['checked']],
    ['checkbox',true],['email','fictional@example.test'],['phone','9811111111'],
  ] as const;
  for(const formId of recordingIds){
    const fields=examples.map(([type],order)=>({id:`context_${type}`,key:`context_${type}`,type,label:`Context ${type}`,
      required:true,order,status:'active',...(['single_choice','multiple_choice'].includes(type)?{choices:[{value:'checked',label:'Checked'},{value:'pending',label:'Pending'}]}:{})}));
    const draft=validateFormDraft(formId,{formId,fields});
    const snapshot=validateAnswersForDefinition(FORM_REGISTRY[formId],{...draft,version:1,publishedAt:1},
      examples.map(([type,value])=>({fieldId:`context_${type}`,value})));
    assert.equal(snapshot.answers.length,examples.length,formId);
  }
  const nestedKeys={
    'staff.homepage-hero-manager':['position','eyebrow','headingLead','highlightedPhrase','headingTail','body',
      'primaryActionLabel','primaryActionHref','secondaryActionLabel','secondaryActionHref','mediaType','mediaId',
      'imageAlt','posterMediaId','videoDescription','imageNote','file'],
    'staff.homepage-occasion-manager':['position','eyebrow','headingLead','highlightedPhrase','headingTail','body',
      'supportingNote','cards','kicker','title','destination','icon','theme'],
  };
  for(const [formId,keys] of Object.entries(nestedKeys))for(const key of keys)
    assert.equal(FORM_REGISTRY[formId].baseFields.find(field=>field.key===key)?.capability,'protected',`${formId}:${key}`);
});
void test('cart is an implemented protected handler with no custom answers or recording capability',()=>{
  const definition=FORM_REGISTRY['commerce.add-to-cart'];assert.equal(definition.adapterId,definition.id);
  assert.equal(IMPLEMENTED_FORM_ADAPTERS[definition.id]?.route,'/api/cart');assert.equal(definition.capabilities.answerBehavior,'none');
  assert.deepEqual(definition.capabilities.customFieldTypes,[]);
  assert.throws(()=>validateFormDraft(definition.id,{formId:definition.id,fields:[{id:'context_note',key:'context_note',
    type:'short_text',label:'Context',required:true,order:0,status:'active'}]}));
});

declare global { var cartCatalogWrites: { productId: string; quantity: number }[] }
globalThis.cartCatalogWrites = [];
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={DB:{}}', shortCircuit: true };
  if (specifier === '@/lib/db/d1') return { url: 'data:text/javascript,export function requireDatabase(value){return value.DB}', shortCircuit: true };
  if (specifier === '@/lib/analytics/request') return { url: 'data:text/javascript,export async function recordRequestTrafficEvent(){return {}}', shortCircuit: true };
  if (specifier === '@/lib/db/repositories/cart') return { url: `data:text/javascript,
    export class CartConflictError extends Error {}
    export async function addCartItem(db,hash,productId,quantity){globalThis.cartCatalogWrites.push({productId,quantity});return {items:[],itemCount:quantity,itemSubtotalPaisa:0,hasUnavailableItems:false}}
    export async function getCart(){return {items:[]}}
    export async function updateCartItem(){return {items:[]}}
    export async function removeCartItem(){return {items:[]}}
  `, shortCircuit: true };
  return nextResolve(specifier, context);
} });

function post(body: unknown): Request {
  return new Request('http://localhost/api/cart', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

void test('protected add-to-cart rejects custom form envelopes and preserves the product/quantity contract', async () => {
  const { POST } = await import('../app/api/cart/route');
  const productId = 'fictional-product';
  const forbidden = [
    { productId, quantity: 2, formVersion: 1 },
    { productId, quantity: 2, customAnswers: [] },
    { productId, quantity: 2, 'custom.context_note': 'ignored' },
    { productId, quantity: 2, custom: { context_note: 'ignored' } },
    { productId, quantity: 2, requestId: 'unsupported-attempt' },
  ];
  for (const body of forbidden) assert.equal((await POST(post(body))).status, 400);
  assert.equal(globalThis.cartCatalogWrites.length, 0);
  const accepted = await POST(post({ productId, quantity: 2 }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(globalThis.cartCatalogWrites, [{ productId, quantity: 2 }]);
});

void test('add-to-cart quantity surface has a stable catalog identity without a custom answer input', () => {
  const source = readFileSync('components/commerce/add-to-cart.tsx', 'utf8');
  assert.match(source, /data-form-id="commerce\.add-to-cart"/);
  assert.doesNotMatch(source, /ConfiguredFields|customAnswers|formVersion/);
});
