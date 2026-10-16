import assert from 'node:assert/strict';
import test from 'node:test';
import { translateSqliteSql } from '../lib/runtime/node-bindings';

void test('native scheduled-state guards distinguish NULL from zero', () => {
  assert.equal(translateSqliteSql('WHERE draft_revision IS ? AND c.scheduled_revision IS NOT ? AND scheduled_for IS ?'),
    'WHERE draft_revision <=> ? AND NOT (c.scheduled_revision <=> ?) AND scheduled_for <=> ?');
});

void test('native maker document prefixes concatenate without depending on SQL mode', () => {
  for (const column of ['seller_id','d.seller_id'])
    assert.equal(translateSqliteSql(`SELECT 'private/seller-documents/' || ${column} || '/' AS prefix`),
      `SELECT CONCAT(BINARY 'private/seller-documents/', ${column}, '/') AS prefix`);
});

void test('native managed history requires a JSON string digest', () => {
  assert.equal(translateSqliteSql("SELECT 1 WHERE json_type(audit.next_json,'$.catalogDigest')='text'"),
    "SELECT 1 WHERE JSON_TYPE(JSON_EXTRACT(audit.next_json,'$.catalogDigest'))='STRING'");
});

void test('native public maker evidence extracts SQL strings and SQL NULL from snapshots', () => {
  for (const path of ['$.version','$.settingVersionIds.account','$.settingVersionIds.retention']) {
    const extract=`JSON_EXTRACT(d.agreement_snapshot_json,'${path}')`;
    assert.equal(translateSqliteSql(`SELECT json_extract(d.agreement_snapshot_json,'${path}')`),
      `SELECT CASE WHEN JSON_TYPE(${extract})='NULL' THEN NULL ELSE JSON_UNQUOTE(${extract}) END`);
  }
});

void test('new native translations leave strings, identifiers and comments unchanged', () => {
  for (const sql of [
    "SELECT 'draft_revision IS ?' AS note, \"scheduled_for IS ?\" AS quoted",
    "SELECT `scheduled_revision IS ?` FROM notes",
    "SELECT 1 -- draft_revision IS ?\n/* scheduled_for IS NOT ? */",
    "SELECT 'it''s scheduled_for IS ?' AS note",
    "SELECT 1 /* json_type(audit.next_json,'$.catalogDigest')='text' */",
    "SELECT 1 -- 'private/seller-documents/' || seller_id || '/'",
    'SELECT other_column IS ? FROM unrelated',
  ]) assert.equal(translateSqliteSql(sql), sql);
});
