import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAdminSection, adminSections } from '../components/admin/admin-sections';
import { deskAge, deskFilter, deskHref, deskShortcut } from '../components/admin/seller-desk-navigation';

void test('Seller desk opens first for Super Admin and keeps Applications and seller records in their own tabs', () => {
  const sections = adminSections('super_admin');
  const sellers = sections.find(section => section.id === 'sellers')!;
  assert.equal(sellers.tabs[0].href,deskHref());
  assert.equal(activeAdminSection(sections,deskHref())?.tab.label,'Seller desk');
  assert.equal(activeAdminSection(sections,'/admin/sellers',new URLSearchParams('reviewType=seller_application'))?.tab.label,'Applications');
  assert.equal(activeAdminSection(sections,'/admin/sellers/registered')?.tab.label,'All sellers');
  assert.equal(adminSections('admin').flatMap(section => section.tabs).some(tab => tab.href === deskHref()),false);
});

void test('Desk deep links preserve the exact source and previous Today view', () => {
  const url = new URL(deskHref('product_intake_review:item/2','products','/admin?todayView=mine'),'https://example.test');
  assert.equal(url.searchParams.get('item'),'product_intake_review:item/2');
  assert.equal(url.searchParams.get('returnTo'),'/admin?todayView=mine');
  assert.equal(deskFilter(url.searchParams.get('filter')!),'products');
  assert.equal(deskFilter('unknown'),'all');
  assert.equal(deskAge(3600000,7200000),'1 hour');
  assert.equal(deskAge(0,3*86400000),'3 days');
});

void test('Desk keyboard shortcuts leave typing, composing, modal and modified events alone', () => {
  const event = {key:'a',altKey:false,metaKey:false,ctrlKey:false,shiftKey:false,repeat:false,isComposing:false,defaultPrevented:false,target:null};
  for (const key of ['j','k','a','c']) {
    assert.equal(deskShortcut({...event,key}),key);
    for (const selector of ['textarea','input','select','[role="textbox"]','[role="dialog"]','[role="combobox"]','[contenteditable]:not([contenteditable="false"])']) {
      const target = {closest:(selectors:string) => selectors.split(', ').includes(selector) ? {} : null} as unknown as Element;
      assert.equal(deskShortcut({...event,key,target}),null);
    }
  }
  for (const modifier of ['altKey','ctrlKey','metaKey','shiftKey','repeat','isComposing','defaultPrevented']) {
    assert.equal(deskShortcut({...event,[modifier]:true}),null);
  }
  assert.equal(deskShortcut({...event,key:'p'}),null);
});
