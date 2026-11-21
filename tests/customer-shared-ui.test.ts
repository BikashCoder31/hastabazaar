import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomerActingChip, type CustomerActor } from '../components/storefront/customer-acting-chip';
import { CustomerParcelCash } from '../components/storefront/customer-parcel-cash';
import { CustomerParcelProgress } from '../components/storefront/customer-parcel-progress';
import { CustomerYourTurnCard } from '../components/storefront/customer-your-turn-card';

void test('customer action chips identify the responsible party by name', () => {
  for (const [actor, label] of Object.entries({ you: 'You', seller: 'Seller', courier: 'Courier', hastabazaar: 'Hastabazaar', done: 'Done' })) {
    const html = renderToStaticMarkup(createElement(CustomerActingChip, { actor: actor as CustomerActor }));
    assert.match(html, /Who is acting now/);
    assert.ok(html.includes(label));
  }
  const turn = renderToStaticMarkup(createElement(CustomerYourTurnCard, {
    title: 'Confirm your date', showChip: true, action: createElement('a', { href: '/account/orders' }, 'Answer'),
  }));
  assert.match(turn, /Your turn/);
  assert.match(turn, /<a href="\/account\/orders">Answer<\/a>/);
});

void test('parcel status is marked in words and cash uses the exact recorded amount', () => {
  for (const [condition, label] of [['waiting', 'Paused'], ['problem', 'Needs attention']] as const) {
    const html = renderToStaticMarkup(createElement(CustomerParcelProgress, { stage: 'with-courier', condition }));
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    assert.match(html, /Placed.*Preparing.*Packed.*With courier.*Delivered/);
    assert.ok(html.includes(label));
  }
  const cash = renderToStaticMarkup(createElement(CustomerParcelCash, { amountPaisa: 140055 }));
  assert.match(cash, /Cash to give the courier/);
  assert.match(cash, /1,400\.55/);
});
