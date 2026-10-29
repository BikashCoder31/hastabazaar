import assert from 'node:assert/strict';
import test from 'node:test';
import { readOptionalRegistration, optionalRegistrationInput, completeRegistrationInput } from '../lib/sellers/registration-intake';

void test('empty optional registration is accepted for follow-up without inventing verification or consent', () => {
  const answers = readOptionalRegistration(new FormData());
  const input = optionalRegistrationInput(answers, 'fictional@example.test');
  assert.equal(input.legalName, ''); assert.equal(input.phone, ''); assert.equal(input.managedIdentity, undefined);
  assert.equal(completeRegistrationInput(answers, 'fictional@example.test').input, undefined);
});
void test('blank optional numbers pass while nonblank invalid numbers fail with a useful error', () => {
  const data = new FormData(); data.set('phone', ''); data.set('personalPan', '');
  assert.doesNotThrow(() => readOptionalRegistration(data));
  data.set('phone', '123'); assert.throws(() => readOptionalRegistration(data), /10 digits/);
  data.set('phone', '1234567890'); data.set('phoneCountry', 'NP'); assert.doesNotThrow(() => readOptionalRegistration(data));
});
