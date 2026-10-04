import assert from 'node:assert/strict';
import test from 'node:test';

type Autoplay = {
  reset: () => void;
  reschedule: () => void;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
};
async function createAutoplay(advance: () => void, manualHoldMs?: number): Promise<Autoplay> {
  const modulePath = '../lib/homepage/slider-autoplay';
  const sliderModule = (await import(modulePath).catch(() => null)) as null | {
    createSliderAutoplay: (advance: () => void, options?: {manualHoldMs?:number}) => Autoplay;
  };
  assert.ok(sliderModule, 'shared six-second autoplay must exist');
  return sliderModule.createSliderAutoplay(advance, {manualHoldMs});
}

void test('automatic browsing advances only after six seconds and repeats with a fresh interval', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
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
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
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
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
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

void test('hero manual browsing holds twelve seconds, then returns to six-second rotation', async context => {
  context.mock.timers.enable({apis:['setTimeout','Date']});
  let advances=0;
  const autoplay=await createAutoplay(()=>advances++,12_000);
  context.mock.timers.tick(5_000);
  autoplay.reset();
  context.mock.timers.tick(11_999);
  assert.equal(advances,0,'manual browsing must receive the full twelve-second hold');
  context.mock.timers.tick(1);
  assert.equal(advances,1);
  context.mock.timers.tick(5_999);
  assert.equal(advances,1,'automatic selection must return to the normal six-second interval');
  context.mock.timers.tick(1);
  assert.equal(advances,2);
  autoplay.dispose();
});

void test('hero hold survives temporary pauses and reinitialization without extending its deadline', async context => {
  context.mock.timers.enable({apis:['setTimeout','Date']});
  let advances=0;
  const autoplay=await createAutoplay(()=>advances++,12_000);
  autoplay.reset();
  context.mock.timers.tick(1_000);
  autoplay.setPaused(true);
  context.mock.timers.tick(1_000);
  autoplay.setPaused(false);
  context.mock.timers.tick(1_000);
  autoplay.reschedule();
  context.mock.timers.tick(8_999);
  assert.equal(advances,0,'pausing or reInit must not shorten the manual hold');
  context.mock.timers.tick(1);
  assert.equal(advances,1,'reInit must not restart a twelve-second manual hold');
  autoplay.dispose();
});

void test('interaction while paused retains the hero hold, and an expired hold resumes with a fresh six seconds', async context => {
  context.mock.timers.enable({apis:['setTimeout','Date']});
  let advances=0;
  const autoplay=await createAutoplay(()=>advances++,12_000);
  autoplay.setPaused(true);
  context.mock.timers.tick(3_000);
  autoplay.reset();
  context.mock.timers.tick(3_000);
  autoplay.setPaused(false);
  context.mock.timers.tick(8_999);
  assert.equal(advances,0);
  context.mock.timers.tick(1);
  assert.equal(advances,1);
  autoplay.setPaused(true);
  autoplay.reset();
  context.mock.timers.tick(18_000);
  autoplay.setPaused(false);
  context.mock.timers.tick(5_999);
  assert.equal(advances,1,'leaving a long hover must not cause an immediate jump');
  context.mock.timers.tick(1);
  assert.equal(advances,2);
  autoplay.dispose();
  autoplay.reset();
  context.mock.timers.tick(12_000);
  assert.equal(advances,2,'disposed controllers cannot restart after an interaction');
});
