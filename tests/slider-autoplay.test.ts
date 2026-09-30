import assert from 'node:assert/strict';
import test from 'node:test';

type Autoplay = {
  reset: () => void;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
};
async function createAutoplay(advance: () => void): Promise<Autoplay> {
  const modulePath = '../lib/homepage/slider-autoplay';
  const sliderModule = (await import(modulePath).catch(() => null)) as null | {
    createSliderAutoplay: (advance: () => void) => Autoplay;
  };
  assert.ok(sliderModule, 'shared six-second autoplay must exist');
  return sliderModule.createSliderAutoplay(advance);
}

void test('automatic browsing advances only after six seconds and repeats with a fresh interval', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let advances = 0;
  const autoplay = await createAutoplay(() => advances++);
  context.mock.timers.tick(5999);
  assert.equal(advances, 0);
  context.mock.timers.tick(1);
  assert.equal(advances, 1);
  context.mock.timers.tick(6000);
  assert.equal(advances, 2);
  autoplay.dispose();
  context.mock.timers.tick(6000);
  assert.equal(advances, 2);
});

void test('manual browsing replaces the pending interval with a full six seconds', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let advances = 0;
  const autoplay = await createAutoplay(() => advances++);
  context.mock.timers.tick(5000);
  autoplay.reset();
  context.mock.timers.tick(5999);
  assert.equal(advances, 0);
  context.mock.timers.tick(1);
  assert.equal(advances, 1);
  autoplay.dispose();
});

void test('pausing cancels pending motion and resuming waits a complete interval', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let advances = 0;
  const autoplay = await createAutoplay(() => advances++);
  context.mock.timers.tick(5000);
  autoplay.setPaused(true);
  autoplay.reset();
  context.mock.timers.tick(18000);
  assert.equal(advances, 0);
  autoplay.setPaused(false);
  context.mock.timers.tick(5999);
  assert.equal(advances, 0);
  context.mock.timers.tick(1);
  assert.equal(advances, 1);
  autoplay.dispose();
});
