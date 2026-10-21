import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mutateFeeWaiver,
  getFeeWaiverState,
} from '../lib/db/repositories/fee-waivers';
import { selectFeeWaiver } from '../lib/marketplace/fee-waivers';
import {
  feeWaiverFixture,
  feeWaiverTerms as terms,
  feeWaiverContext as ctx,
  interleaveFeeWaiverBatch,
  interleaveFeeWaiverStateRead,
} from './helpers/fee-waiver-fixture';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
  incentiveOrder,
  incentiveItem,
} from './helpers/incentive-db';

for (const changed of [false, true])
  void test(`receipt miss then winning state read ${changed ? 'rejects changed payload as conflict' : 'replays identical response'}`, async () => {
    const f = await feeWaiverFixture();
    try {
      const command = { type: 'create', terms } as const;
      let winner: unknown;
      const raced = interleaveFeeWaiverStateRead(f.database, async () => {
        winner = await mutateFeeWaiver(
          f.database,
          ctx('early-race', 0),
          command,
        );
      });
      const attempt = mutateFeeWaiver(
        raced,
        ctx('early-race', 0),
        changed
          ? { type: 'create', terms: { ...terms, name: 'Changed intent' } }
          : command,
      );
      if (changed) await assert.rejects(attempt, { code: 'conflict' });
      else assert.deepEqual(await attempt, winner);
      assert.equal((await getFeeWaiverState(f.database)).revision, 1);
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM marketplace_fee_waiver_requests')
          .get()?.n,
        1,
      );
    } finally {
      await f.dispose();
    }
  });

void test('unexpected audit failure retains its diagnostic error and rolls back without reporting stale', async () => {
  const f = await feeWaiverFixture();
  try {
    f.sqlite.exec(
      "CREATE TRIGGER fail_fee_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'unexpected audit storage failure'); END",
    );
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('audit-diagnostic', 0), {
        type: 'create',
        terms,
      }),
      /unexpected audit storage failure/,
    );
    assert.equal((await getFeeWaiverState(f.database)).revision, 0);
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM marketplace_fee_waiver_requests')
        .get()?.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});

for (const isReplay of [false, true])
  void test(`unexpected ${isReplay ? 'replay' : 'mutation'} database batch errors propagate unchanged with active authority`, async () => {
    const f = await feeWaiverFixture();
    try {
      const command = { type: 'create', terms } as const;
      const fault = new Error('simulated database transport failure');
      const failedBatch = new Proxy(f.database, {
        get(target, key) {
          if (key === 'batch')
            return async () => {
              throw fault;
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      if (isReplay)
        await mutateFeeWaiver(f.database, ctx('transport', 0), command);
      await assert.rejects(
        mutateFeeWaiver(failedBatch, ctx('transport', 0), command),
        (error) => error === fault,
      );
      assert.equal(
        (await getFeeWaiverState(f.database)).revision,
        isReplay ? 1 : 0,
      );
    } finally {
      await f.dispose();
    }
  });

void test('global control cannot contain extra null or non-default rows', async () => {
  const f = await feeWaiverFixture();
  try {
    assert.throws(() =>
      f.sqlite.exec(
        'INSERT INTO marketplace_fee_waiver_control(id,revision) VALUES (NULL,0)',
      ),
    );
    assert.throws(() =>
      f.sqlite.exec(
        "INSERT INTO marketplace_fee_waiver_control(id,revision) VALUES ('other',0)",
      ),
    );
  } finally {
    await f.dispose();
  }
});

void test('multiple campaigns publish and pause/resume selects the next overlap, preserving every version', async () => {
  const f = await feeWaiverFixture();
  try {
    const a = await mutateFeeWaiver(f.database, ctx('create-a', 0), {
      type: 'create',
      terms,
    });
    const b = await mutateFeeWaiver(f.database, ctx('create-b', 1), {
      type: 'create',
      terms: { ...terms, startsAt: 11 },
    });
    await mutateFeeWaiver(f.database, ctx('publish-a', 2), {
      type: 'publish',
      campaignId: a.id,
    });
    await mutateFeeWaiver(f.database, ctx('publish-b', 3), {
      type: 'publish',
      campaignId: b.id,
    });
    let state = await getFeeWaiverState(f.database);
    assert.equal(state.revision, 4);
    assert.equal(selectFeeWaiver(state.campaigns, 100)?.id, a.id);
    await mutateFeeWaiver(f.database, ctx('pause-a', 4), {
      type: 'pause',
      campaignId: a.id,
    });
    state = await getFeeWaiverState(f.database);
    assert.equal(selectFeeWaiver(state.campaigns, 100)?.id, b.id);
    await mutateFeeWaiver(f.database, ctx('resume-a', 5), {
      type: 'resume',
      campaignId: a.id,
    });
    const revised = await mutateFeeWaiver(f.database, ctx('revise-a', 6), {
      type: 'revise',
      campaignId: a.id,
      terms: { ...terms, name: 'Revised launch' },
    });
    assert.equal(revised.revision, 5);
    assert.equal(revised.state, 'published');
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT name FROM marketplace_fee_waiver_revisions WHERE campaign_id=? AND revision=2',
        )
        .get(a.id)?.name,
      'Global launch',
    );
    assert.throws(() =>
      f.sqlite.exec(
        "UPDATE marketplace_fee_waiver_revisions SET name='changed'",
      ),
    );
    assert.throws(() =>
      f.sqlite.exec('DELETE FROM marketplace_fee_waiver_revisions'),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'marketplace.fee-waiver.%'",
        )
        .get()?.n,
      7,
    );
  } finally {
    await f.dispose();
  }
});
void test('replay returns original response only for identical actor, revision and command, with live authorization', async () => {
  const f = await feeWaiverFixture();
  try {
    const command = { type: 'create', terms } as const;
    const original = await mutateFeeWaiver(
      f.database,
      ctx('create', 0),
      command,
    );
    await mutateFeeWaiver(f.database, ctx('publish', 1), {
      type: 'publish',
      campaignId: original.id,
    });
    assert.deepEqual(
      await mutateFeeWaiver(
        f.database,
        ctx('create', 0, { now: 200 }),
        command,
      ),
      original,
    );
    for (const changed of [
      { ...command, terms: { ...terms, name: 'Other' } },
      { type: 'end', campaignId: original.id },
    ] as const)
      await assert.rejects(
        mutateFeeWaiver(f.database, ctx('create', 0), changed),
      );
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('create', 1), command),
    );
    await assert.rejects(
      mutateFeeWaiver(
        f.database,
        ctx('create', 0, { authSubject: 'wrong' }),
        command,
      ),
    );
    f.sqlite.exec(
      "DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'",
    );
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('create', 0), command),
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM marketplace_fee_waiver_requests')
        .get()?.n,
      2,
    );
  } finally {
    await f.dispose();
  }
});
void test('audit failure, unauthorized identity, stale revision and revoked live role roll back the whole change', async () => {
  const f = await feeWaiverFixture();
  try {
    const command = { type: 'create', terms } as const;
    await assert.rejects(
      mutateFeeWaiver(
        f.database,
        ctx('admin', 0, { actorId: 'staff', authSubject: 'staff' }),
        command,
      ),
    );
    await assert.rejects(mutateFeeWaiver(f.database, ctx('stale', 1), command));
    f.sqlite.exec(
      "CREATE TRIGGER reject_fee_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END",
    );
    await assert.rejects(mutateFeeWaiver(f.database, ctx('audit', 0), command));
    f.sqlite.exec('DROP TRIGGER reject_fee_audit');
    const raced = interleaveFeeWaiverBatch(f.database, async () => {
      f.sqlite.exec("DELETE FROM user_roles WHERE user_id='owner'");
    });
    await assert.rejects(mutateFeeWaiver(raced, ctx('revoked', 0), command));
    for (const table of [
      'marketplace_fee_waiver_campaigns',
      'marketplace_fee_waiver_revisions',
      'marketplace_fee_waiver_requests',
      'staff_permission_guards',
    ])
      assert.equal(
        f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n,
        0,
      );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'marketplace.fee-waiver.%'",
        )
        .get()?.n,
      0,
    );
    assert.equal((await getFeeWaiverState(f.database)).revision, 0);
  } finally {
    await f.dispose();
  }
});
void test('racing identical requests replay once and a replay checks role again inside its transaction', async () => {
  const f = await feeWaiverFixture();
  try {
    const command = { type: 'create', terms } as const;
    let winner: unknown;
    const race = interleaveFeeWaiverBatch(f.database, async () => {
      winner = await mutateFeeWaiver(f.database, ctx('same', 0), command);
    });
    assert.deepEqual(
      await mutateFeeWaiver(race, ctx('same', 0), command),
      winner,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM marketplace_fee_waiver_revisions')
        .get()?.n,
      1,
    );
    const replayRace = interleaveFeeWaiverBatch(f.database, async () => {
      f.sqlite.exec("UPDATE users SET status='suspended' WHERE id='owner'");
    });
    await assert.rejects(mutateFeeWaiver(replayRace, ctx('same', 0), command));
  } finally {
    await f.dispose();
  }
});
void test('fee evidence enforces one immutable full waiver or no waiver with integer reconciled amounts', async () => {
  const f = await feeWaiverFixture();
  try {
    await seedIncentiveCustomer(f.database);
    await seedIncentiveInventory(f.database);
    await incentiveOrder(f.database, 'order').run();
    await incentiveItem(f.database, 'line', 'order').run();
    const campaign = await mutateFeeWaiver(f.database, ctx('create', 0), {
      type: 'create',
      terms,
    });
    const insert = (
      standard: number,
      waived: number,
      net: number,
      campaignId: string | null = null,
      campaignRevision: number | null = null,
    ) =>
      f.sqlite
        .prepare(
          'INSERT INTO order_item_marketplace_fees(order_item_id,standard_bps,base_paisa,standard_paisa,waived_paisa,net_paisa,campaign_id,campaign_revision,created_at) VALUES (?,1000,10000,?,?,?,?,?,100)',
        )
        .run('line', standard, waived, net, campaignId, campaignRevision);
    for (const [standard, waived, net] of [
      [1000, 1001, -1],
      [1000, 200, 800],
      [1000.5, 0, 1000.5],
      [1000, 0, 0],
      [Number.MAX_SAFE_INTEGER + 1, 0, Number.MAX_SAFE_INTEGER + 1],
    ])
      assert.throws(() => insert(standard, waived, net));
    assert.throws(() => insert(1000, 1000, 0, campaign.id, null));
    assert.throws(() => insert(1000, 1000, 0, campaign.id, 99));
    insert(1000, 1000, 0, campaign.id, 1);
    assert.throws(() => insert(1000, 1000, 0, campaign.id, 1));
    assert.throws(() =>
      f.sqlite.exec(
        'UPDATE order_item_marketplace_fees SET net_paisa=1000,waived_paisa=0',
      ),
    );
    assert.throws(() =>
      f.sqlite.exec('DELETE FROM order_item_marketplace_fees'),
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT commission_paisa FROM order_items WHERE id='line'")
        .get()?.commission_paisa,
      900,
    );
  } finally {
    await f.dispose();
  }
});
void test('a concurrent publish or pause wins once and stale changes cannot overwrite it', async () => {
  const f = await feeWaiverFixture();
  try {
    const a = await mutateFeeWaiver(f.database, ctx('create', 0), {
      type: 'create',
      terms,
    });
    const race = interleaveFeeWaiverBatch(f.database, () =>
      mutateFeeWaiver(f.database, ctx('winner', 1), {
        type: 'publish',
        campaignId: a.id,
      }),
    );
    await assert.rejects(
      mutateFeeWaiver(race, ctx('loser', 1), {
        type: 'publish',
        campaignId: a.id,
      }),
    );
    const pauseRace = interleaveFeeWaiverBatch(f.database, () =>
      mutateFeeWaiver(f.database, ctx('pause-winner', 2), {
        type: 'pause',
        campaignId: a.id,
      }),
    );
    await assert.rejects(
      mutateFeeWaiver(pauseRace, ctx('revise-loser', 2), {
        type: 'revise',
        campaignId: a.id,
        terms: { ...terms, name: 'Lost change' },
      }),
    );
    assert.deepEqual(
      (await getFeeWaiverState(f.database)).campaigns.map((c) => [
        c.state,
        c.name,
        c.revision,
      ]),
      [['paused', 'Global launch', 3]],
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM marketplace_fee_waiver_requests')
        .get()?.n,
      3,
    );
  } finally {
    await f.dispose();
  }
});
void test('expired published schedules cannot pause/resume, and ended campaigns are terminal', async () => {
  const f = await feeWaiverFixture();
  try {
    const a = await mutateFeeWaiver(f.database, ctx('create', 0), {
      type: 'create',
      terms,
    });
    await mutateFeeWaiver(f.database, ctx('publish', 1), {
      type: 'publish',
      campaignId: a.id,
    });
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('expired-pause', 2, { now: 1000 }), {
        type: 'pause',
        campaignId: a.id,
      }),
    );
    await mutateFeeWaiver(f.database, ctx('pause', 2), {
      type: 'pause',
      campaignId: a.id,
    });
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('expired-resume', 3, { now: 1000 }), {
        type: 'resume',
        campaignId: a.id,
      }),
    );
    await mutateFeeWaiver(f.database, ctx('end', 3), {
      type: 'end',
      campaignId: a.id,
    });
    for (const type of ['resume', 'publish', 'pause', 'end'] as const)
      await assert.rejects(
        mutateFeeWaiver(f.database, ctx(type, 4), { type, campaignId: a.id }),
      );
    await assert.rejects(
      mutateFeeWaiver(f.database, ctx('revise', 4), {
        type: 'revise',
        campaignId: a.id,
        terms,
      }),
    );
  } finally {
    await f.dispose();
  }
});
