import type { FormAudience, FormDefinition } from './types';

function customerForm(
  id: string,
  audience: FormAudience,
  mode: 'query' | 'system',
  route: string,
  keys: readonly string[],
  explanation: string,
): FormDefinition {
  return Object.freeze({
    id,
    adapterId: id,
    audience,
    mode,
    route,
    baseFields: Object.freeze(keys.map(key => ({
      key,
      type: 'existing',
      label: key,
      capability: 'protected' as const,
      explanation,
    }))),
    capabilities: Object.freeze({
      customFieldTypes: [],
      answerBehavior: mode === 'query' ? 'query' : 'none',
      explanation,
    }),
  });
}

export const CUSTOMER_EXPERIENCE_FORM_CONTRACTS = Object.freeze([
  customerForm('public.help-search', 'public', 'query', '/help', ['q'],
    'Search matches the existing help topics without recording the query as a form answer.'),
  customerForm('account.order-search', 'customer', 'query', '/account/orders', ['q', 'tab'],
    'Search and tabs filter the signed-in customer’s own orders without storing an answer.'),
  customerForm('commerce.return-reply', 'customer', 'system', '/orders/:number/returns/:id/reply',
    ['message', 'evidence', 'locale', 'idempotencyKey'],
    'The existing return case owns the reply, private photos and exact submission recovery.'),
  customerForm('commerce.complaint-reply', 'customer', 'system', '/orders/:number/complaints/:id/reply',
    ['message', 'locale', 'idempotencyKey'],
    'The existing complaint owns the reply and exact submission recovery.'),
  customerForm('commerce.bank-transfer-claim', 'customer', 'system', '/api/account/payments/:id/claim',
    ['amountPaisa', 'paymentDate', 'bankReference', 'evidenceIds', 'note', 'requestId', 'expectedRevision'],
    'The native payment claim validates the amount and evidence for the current order and retains exact recovery.'),
]);
