import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSellerDeskFix } from '../components/admin/seller-desk-fix-note';

void test('marked checks append once and removing a mark preserves the seller note edits', () => {
  const photo='Please replace the cover photo.', offer='Please check the offers.';
  const first=toggleSellerDeskFix([], 'Please keep the current title.', photo);
  assert.deepEqual(first.marked,[photo]);
  const second=toggleSellerDeskFix(first.marked,first.note,offer);
  assert.equal(second.note,'Please keep the current title.\n'+photo+'\n'+offer);
  const remove=toggleSellerDeskFix(second.marked,second.note.replace(offer,'Show the size of each offer.'),photo);
  assert.deepEqual(remove,{marked:[offer],note:'Please keep the current title.\nShow the size of each offer.'});
  assert.equal(toggleSellerDeskFix(remove.marked,remove.note,offer).note,remove.note);
});
