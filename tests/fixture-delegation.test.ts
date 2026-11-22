import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureWithOverrides } from './helpers/fixture-delegation';

void test('fixture overrides preserve native receivers, prototype methods and explicit boundary faults', async () => {
  class NativeFixture {
    #value = 7;
    read() { return this.#value; }
    bind() { return this; }
    async batch() { return this.#value; }
    get value() { return this.#value; }
  }
  const fixture = new NativeFixture();
  const delegated = fixtureWithOverrides(fixture, { async batch() { throw new Error('Owned fixture fault'); } });
  assert.equal(delegated instanceof NativeFixture, true);
  assert.equal(delegated.value, 7);
  assert.equal(delegated.read(), 7);
  const read = Reflect.get(delegated, 'read') as () => number;
  assert.equal(read(), 7);
  assert.equal(delegated.bind(), delegated);
  await assert.rejects(delegated.bind().batch(), /Owned fixture fault/);
  await assert.rejects(delegated.batch(), /Owned fixture fault/);
  assert.equal(await fixture.batch(), 7);
  const overridden: NativeFixture = fixtureWithOverrides(fixture, {
    async batch(this: NativeFixture): Promise<number> {
      assert.equal(this, overridden);
      return this.read();
    },
  });
  assert.equal(await overridden.batch(), 7);
});
