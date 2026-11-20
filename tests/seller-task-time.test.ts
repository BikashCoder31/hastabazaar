import test from 'node:test';
import assert from 'node:assert/strict';
import {sellerTaskTimestamp} from '../lib/seller/task-presentation';
void test('task targets display the actual Nepal date and time, not a date-only deadline',()=>{const value=sellerTaskTimestamp(Date.UTC(2026,10,3,8,15));assert.match(value,/Nov 3, 2026/);assert.match(value,/2:00\s*PM/);assert.match(value,/Nepal time/);});
