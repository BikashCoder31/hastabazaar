import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { companyPublicContacts } from '../lib/content/company-details';
import {
  findSupportAnswers,
  supportTopics,
  supportQuestionGroups,
  supportWidgetVisible,
  whatsappSupportHref,
} from '../lib/support/assistant';

void test('support and grievance contacts use the approved company number', () => {
  assert.equal(companyPublicContacts.supportPhone, '+977 9747642247');
  assert.equal(
    companyPublicContacts.grievancePhone,
    companyPublicContacts.supportPhone,
  );
});

void test('common customer and seller questions match relevant guides', () => {
  for (const [query, id] of [
    ['Where is my order?', 'tracking'],
    ['What is the delivery charge?', 'shipping'],
    ['My item arrived broken', 'returns'],
    ['How do I become a seller?', 'selling'],
    ['When will my payout arrive?', 'payouts'],
    ['Can I customise this?', 'custom'],
    ['डेलिभरी कति लाग्छ?', 'shipping'],
    ['फिर्ता गर्न मिल्छ?', 'returns'],
    ['delivery kati lagcha', 'shipping'],
    ['gift ideas', 'gifts'],
  ])
    assert.equal(findSupportAnswers(query)[0]?.id, id, query);
});

void test('unknown, blank and incidental substrings do not invent an answer', () => {
  for (const query of [
    '',
    '   ',
    'What is the weather tomorrow?',
    'membership',
    '<script>alert(1)</script>',
  ]) {
    assert.deepEqual(findSupportAnswers(query), [], query);
  }
  assert.ok(
    findSupportAnswers('shipping and returns').some(
      (item) => item.id === 'shipping',
    ),
  );
  assert.ok(
    findSupportAnswers('shipping and returns').some(
      (item) => item.id === 'returns',
    ),
  );
});

void test('expanded customer and seller questions reach specific guidance', () => {
  for (const [query, id] of [
    ['How do I place an order?', 'ordering'],
    ['Do you ship internationally?', 'coverage'],
    ['My delivery is late', 'delay'],
    ['Can I change my delivery address?', 'address'],
    ['I lost my order receipt', 'receipt'],
    ['I forgot my password', 'signin'],
    ['My promo code is not working', 'discounts'],
    ['Where is my wishlist?', 'wishlist'],
    ['Is this item in stock?', 'availability'],
    ['How do I write a review?', 'reviews'],
    ['How do I delete my account?', 'privacy'],
    ['How do I clean this item?', 'care'],
    ['What documents do sellers need?', 'requirements'],
    ['What is my seller application status?', 'application'],
    ['How do I upload a product?', 'listings'],
    ['Why was my listing rejected?', 'listing-review'],
    ['How do I update stock?', 'inventory'],
    ['How do I dispatch an order?', 'fulfillment'],
    ['How do I respond to a return request?', 'seller-cases'],
    ['How do I change my bank details?', 'seller-profile'],
    ['password birse', 'signin'],
    ['stock kasari update garne', 'inventory'],
    ['How do I make a return request?', 'returns'],
    ['I have a customer complaint', 'complaints'],
    ['How do I write a product review?', 'reviews'],
    ['I want to leave a product review', 'reviews'],
    ['My product is under review', 'listing-review'],
    ['My verification code was not received', 'signin'],
    ['My receipt was not received', 'receipt'],
    ['I have not received my order', 'delay'],
  ])
    assert.equal(findSupportAnswers(query)[0]?.id, id, query);
});

void test('browseable questions resolve to unique topics with real destination pages', () => {
  assert.equal(
    new Set(supportTopics.map((topic) => topic.id)).size,
    supportTopics.length,
  );
  for (const topic of supportTopics) {
    for (const link of topic.links) {
      const pathname = new URL(link.href, 'https://hastabazaar.com').pathname;
      assert.ok(
        existsSync(new URL(`../app${pathname}/page.tsx`, import.meta.url)),
        link.href,
      );
    }
  }
  for (const groups of Object.values(supportQuestionGroups)) {
    for (const { questions } of groups) {
      for (const { topicId, label } of questions) {
        assert.ok(
          supportTopics.some((topic) => topic.id === topicId),
          label,
        );
        assert.equal(findSupportAnswers(label)[0]?.id, topicId, label);
      }
    }
  }
});

void test('specific requests outrank generic order and seller words', () => {
  for (const [query, id] of [
    ['Can I cancel my order?', 'cancellation'],
    ['I want a refund for my order', 'returns'],
    ['Help with my seller payout', 'payouts'],
    ['What are the seller fees?', 'fees'],
    ['What is the delivery fee?', 'shipping'],
    ['Do you accept cash on delivery?', 'payments'],
    ['delivary kati lagcha', 'shipping'],
    ['shiping time', 'shipping'],
    ['order kaha cha', 'tracking'],
  ]) {
    assert.equal(findSupportAnswers(query)[0]?.id, id, query);
  }
  assert.equal(
    findSupportAnswers('delivery fee').some((topic) => topic.id === 'fees'),
    false,
  );
});

void test('handoff goes to the approved number and shares only a safe public product URL', () => {
  const product = new URL(
    whatsappSupportHref(
      'Shipping & delivery',
      '/products/blue-vase?token=private#receipt',
    ),
  );
  assert.equal(
    product.origin + product.pathname,
    'https://wa.me/9779747642247',
  );
  assert.match(product.searchParams.get('text')!, /Shipping & delivery/);
  assert.match(
    product.searchParams.get('text')!,
    /https:\/\/hastabazaar.com\/products\/blue-vase/,
  );
  assert.doesNotMatch(
    product.searchParams.get('text')!,
    /token|private|receipt/,
  );
  for (const path of [
    '/orders/ABC?token=secret',
    '/account',
    '//evil.example/products/item',
    '/products/../account',
    '/products/a/b',
  ]) {
    assert.doesNotMatch(
      new URL(whatsappSupportHref('Support', path)).searchParams.get('text')!,
      /https:|secret|account/,
      path,
    );
  }
});

void test('assistant avoids checkout and private or administrative workspaces', () => {
  for (const path of [
    '/checkout',
    '/admin/orders',
    '/seller/finance',
    '/account',
    '/orders/ABC',
    '/auth/login',
    '/local-testing',
    '/security',
    '/rider',
    '/sell/application',
    '/login',
    '/login/code',
    '/forgot-password/reset',
    '/register',
    '/form-submissions',
  ]) {
    assert.equal(supportWidgetVisible(path), false, path);
  }
  for (const path of [
    '/',
    '/shop',
    '/products/vase',
    '/help',
    '/sell',
    '/contact-us',
  ]) {
    assert.equal(supportWidgetVisible(path), true, path);
  }
  assert.ok(
    supportTopics.every((topic) =>
      topic.links.every((link) => link.href.startsWith('/')),
    ),
  );
});
