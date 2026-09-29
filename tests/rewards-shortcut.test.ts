import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectRewardsShortcut,
  createRewardsShortcutReader,
  type RewardsShortcutState,
} from '../lib/incentives/rewards-shortcut';

const now = 1_800_000_000_000;
function rewards() {
  return {
    balancePoints: 0,
    walletBalancePaisa: 0,
    claimedToday: false,
    nextClaimAt: now + 60_000,
    history: [],
    nextCursor: null,
    state: {
      version: 1,
      revision: 1,
      enabled: true,
      paused: false,
      dailyPoints: 10,
      pointsPerBlock: 100,
      creditPaisaPerBlock: 100,
      startsAt: now - 1000,
      endsAt: now + 120_000,
      status: 'active',
    },
  };
}

void test('only verified active unclaimed rewards show the availability dot', () => {
  assert.deepEqual(projectRewardsShortcut(rewards(), now), {
    available: true,
    recheckAt: now + 60_000,
  });
  for (const status of [
    'disabled',
    'paused',
    'scheduled',
    'expired',
    'exhausted',
  ]) {
    const value = rewards();
    value.state.status = status;
    assert.equal(projectRewardsShortcut(value, now)?.available, false, status);
  }
  for (const change of [
    { claimedToday: true },
    { state: { ...rewards().state, enabled: false } },
    { state: { ...rewards().state, paused: true } },
    { state: { ...rewards().state, dailyPoints: 0 } },
  ])
    assert.equal(
      projectRewardsShortcut({ ...rewards(), ...change }, now)?.available,
      false,
    );
});

void test('availability stops at the server day and campaign end boundaries', () => {
  const value = rewards();
  assert.equal(projectRewardsShortcut(value, now + 59_999)?.available, true);
  assert.equal(projectRewardsShortcut(value, now + 60_000)?.available, false);
  value.state.endsAt = now + 10_000;
  assert.deepEqual(projectRewardsShortcut(value, now), {
    available: true,
    recheckAt: now + 10_000,
  });
  assert.equal(projectRewardsShortcut(value, now + 10_000)?.available, false);
  value.state.startsAt = now + 5000;
  assert.deepEqual(projectRewardsShortcut(value, now), {
    available: false,
    recheckAt: now + 5000,
  });
  assert.equal(projectRewardsShortcut(value, now + 5000)?.available, true);
});

void test('scheduled and claimed snapshots require a new server read at their next boundary', () => {
  const value = rewards();
  value.state.status = 'scheduled';
  value.state.startsAt = now + 5000;
  assert.deepEqual(projectRewardsShortcut(value, now), {
    available: false,
    recheckAt: now + 5000,
  });
  assert.equal(projectRewardsShortcut(value, now + 5000)?.available, false);
  value.state.status = 'active';
  value.claimedToday = true;
  assert.deepEqual(projectRewardsShortcut(value, now), {
    available: false,
    recheckAt: now + 5000,
  });
  assert.equal(projectRewardsShortcut(value, now + 60_000)?.available, false);
});

void test('malformed, missing and unsafe status data fails closed', () => {
  const malformed: unknown[] = [
    null,
    [],
    {},
    { ...rewards(), claimedToday: 'false' },
    { ...rewards(), state: [] },
    { ...rewards(), state: { ...rewards().state, status: 'unknown' } },
  ];
  for (const badTime of [
    0,
    -1,
    NaN,
    Infinity,
    1.5,
    '1800000060000',
    253402300800000,
  ]) {
    malformed.push({ ...rewards(), nextClaimAt: badTime });
    malformed.push({
      ...rewards(),
      state: { ...rewards().state, endsAt: badTime },
    });
  }
  malformed.push({ ...rewards(), state: { ...rewards().state, enabled: 1 } });
  malformed.push({ ...rewards(), state: { ...rewards().state, paused: null } });
  malformed.push({
    ...rewards(),
    state: { ...rewards().state, dailyPoints: -1 },
  });
  malformed.push({
    ...rewards(),
    state: { ...rewards().state, startsAt: now + 121_000 },
  });
  for (const value of malformed)
    assert.equal(projectRewardsShortcut(value, now), null);
  for (const badNow of [0, -1, NaN, Infinity])
    assert.equal(projectRewardsShortcut(rewards(), badNow), null);
});

void test('disabled defaults and open-ended campaigns remain safe', () => {
  const value = rewards();
  const noDates = {
    ...value,
    state: { ...value.state, startsAt: null, endsAt: null },
  };
  assert.equal(projectRewardsShortcut(noDates, now)?.available, true);
  assert.equal(
    projectRewardsShortcut(
      {
        ...noDates,
        state: {
          ...noDates.state,
          status: 'disabled',
          enabled: false,
          dailyPoints: 0,
        },
      },
      now,
    )?.available,
    false,
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

void test('reader uses one minimal uncached authenticated GET and stores only the projection', async () => {
  const changes: (RewardsShortcutState | null)[] = [];
  const reader = createRewardsShortcutReader('subject-a', {
    now: () => now,
    onChange: (state) => changes.push(state),
    fetcher: async function (this: unknown, url, options) {
      assert.equal(
        this,
        undefined,
        'native browser fetch must not receive an options object as its receiver',
      );
      assert.equal(url, '/api/account/rewards?limit=1');
      assert.equal(options?.cache, 'no-store');
      assert.equal(options?.credentials, 'same-origin');
      assert.equal(options?.method, 'GET');
      assert.ok(options?.signal instanceof AbortSignal);
      return Response.json(rewards());
    },
  });
  await reader.refresh();
  assert.deepEqual(changes, [
    null,
    { available: true, recheckAt: now + 60_000 },
  ]);
  reader.stop();
});

void test('guests never request rewards or publish availability', async () => {
  const changes: unknown[] = [];
  const reader = createRewardsShortcutReader(null, {
    now: () => now,
    onChange: (value) => changes.push(value),
    fetcher: async () => {
      throw new Error('Guest fetched');
    },
  });
  await reader.refresh();
  reader.stop();
  assert.deepEqual(changes, []);
});

void test('failed, unauthorized, unavailable and malformed reads clear prior availability', async () => {
  for (const failure of [
    () => Response.json({}, { status: 401 }),
    () => Response.json({}, { status: 503 }),
    () => Response.json({ claimedToday: false }),
    () => new Response('{invalid'),
    () => {
      throw new Error('Network unavailable');
    },
  ]) {
    const changes: (RewardsShortcutState | null)[] = [];
    let reads = 0;
    const reader = createRewardsShortcutReader('subject-a', {
      now: () => now,
      onChange: (value) => changes.push(value),
      fetcher: async () =>
        ++reads === 1 ? Response.json(rewards()) : failure(),
    });
    await reader.refresh();
    await reader.refresh();
    reader.stop();
    assert.equal(changes[1]?.available, true);
    assert.equal(changes.at(-1), null);
  }
});

void test('refresh clears the dot immediately and an older request cannot undo a verified claim', async () => {
  const late = deferred<Response>();
  const afterClaim = deferred<Response>();
  const changes: (RewardsShortcutState | null)[] = [];
  const signals: AbortSignal[] = [];
  let reads = 0;
  const reader = createRewardsShortcutReader('subject-a', {
    now: () => now,
    onChange: (value) => changes.push(value),
    fetcher: async (_url, options) => {
      signals.push(options!.signal as AbortSignal);
      return ++reads === 1
        ? Response.json(rewards())
        : reads === 2
          ? late.promise
          : afterClaim.promise;
    },
  });
  await reader.refresh();
  const staleRead = reader.refresh();
  const claimRead = reader.refresh();
  assert.equal(changes.at(-1), null);
  assert.equal(signals[1].aborted, true);
  afterClaim.resolve(Response.json({ ...rewards(), claimedToday: true }));
  await claimRead;
  late.resolve(Response.json(rewards()));
  await staleRead;
  assert.equal(changes.at(-1)?.available, false);
  reader.stop();
});

void test('disposed identity cannot publish a late response into the next account', async () => {
  const late = deferred<Response>();
  let oldSignal: AbortSignal | undefined;
  const changes: (RewardsShortcutState | null)[] = [];
  const oldReader = createRewardsShortcutReader('subject-a', {
    now: () => now,
    onChange: (value) => changes.push(value),
    fetcher: async (_url, options) => {
      oldSignal = options?.signal as AbortSignal;
      return late.promise;
    },
  });
  const pending = oldReader.refresh();
  oldReader.stop();
  assert.equal(oldSignal?.aborted, true);
  const nextReader = createRewardsShortcutReader('subject-b', {
    now: () => now,
    onChange: (value) => changes.push(value),
    fetcher: async () => Response.json({ ...rewards(), claimedToday: true }),
  });
  await nextReader.refresh();
  late.resolve(Response.json(rewards()));
  await pending;
  assert.equal(changes.at(-1)?.available, false);
  const count = changes.length;
  await oldReader.refresh();
  assert.equal(changes.length, count);
  nextReader.stop();
});
