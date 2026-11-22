import assert from 'node:assert/strict';
import test from 'node:test';
import { readOptionalRegistration, optionalRegistrationInput, completeRegistrationInput } from '../lib/sellers/registration-intake';

void test('empty optional registration is accepted for follow-up without inventing verification or consent', () => {
  const answers = readOptionalRegistration(new FormData());
  const input = optionalRegistrationInput(answers, 'fictional@example.test');
  assert.equal(input.legalName, ''); assert.equal(input.phone, ''); assert.equal(input.managedIdentity, undefined);
  assert.equal(completeRegistrationInput(answers, 'fictional@example.test').input, undefined);
});

void test('optional intake retains a supported international contact through parsing', () => {
  const data = new FormData(); data.set('phoneCountry', 'CN'); data.set('phone', '13812345678');
  assert.equal(optionalRegistrationInput(readOptionalRegistration(data), 'fictional@local.hastabazaar.test').phone, '+8613812345678');
});
void test('blank optional numbers pass while nonblank invalid numbers fail with a useful error', () => {
  const data = new FormData(); data.set('phone', ''); data.set('personalPan', '');
  assert.doesNotThrow(() => readOptionalRegistration(data));
  data.set('phone', '123'); assert.throws(() => readOptionalRegistration(data), /10 digits/);
  data.set('phone', '1234567890'); data.set('phoneCountry', 'NP'); assert.doesNotThrow(() => readOptionalRegistration(data));
});

void test('optional registration accepts a blank or whole ward number in the supported range', () => {
  const data = new FormData();
  for (const ward of ['', '1', '09', '99']) {
    data.set('ward', ward);
    const input = optionalRegistrationInput(readOptionalRegistration(data), 'fictional@example.test');
    assert.equal(input.ward, ward || null);
  }
  for (const ward of ['abc', '0', '-1', '2.5', '1e1', '100']) {
    data.set('ward', ward);
    assert.throws(() => readOptionalRegistration(data), /ward number from 1 to 99/i, ward);
  }
});
