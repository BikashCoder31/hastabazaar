import assert from 'node:assert/strict';
import test from 'node:test';
import * as repository from '../lib/db/repositories/customer-fee-waivers';
import {
  mutateCustomerFeeWaiver,
  getCustomerFeeWaiverState,
} from '../lib/db/repositories/customer-fee-waivers';
import { selectFeeWaiver } from '../lib/marketplace/fee-waivers';
import {
  feeWaiverFixture,
  feeWaiverTerms as terms,
  feeWaiverContext as ctx,
  interleaveFeeWaiverBatch,
  interleaveFeeWaiverStateRead,
} from './helpers/fee-waiver-fixture';

for (const changed of [false, true])
  void test(`receipt miss then winning state read ${changed ? 'rejects changed payload as conflict' : 'replays identical response'}`, async () => {
    const f = await feeWaiverFixture();
    try {
      const command = { type: 'create', terms } as const;
      let winner: unknown;
      const raced = interleaveFeeWaiverStateRead(f.database, async () => {
        winner = await mutateCustomerFeeWaiver(
          f.database,
          ctx('early-race', 0),
          command,
        );
      });
      const attempt = mutateCustomerFeeWaiver(
        raced,
        ctx('early-race', 0),
        changed
          ? { type: 'create', terms: { ...terms, name: 'Changed intent' } }
          : command,
      );
      if (changed) await assert.rejects(attempt, { code: 'conflict' });
      else assert.deepEqual(await attempt, winner);
      assert.equal((await getCustomerFeeWaiverState(f.database)).revision, 1);
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests')
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
      mutateCustomerFeeWaiver(f.database, ctx('audit-diagnostic', 0), {
        type: 'create',
        terms,
      }),
      /unexpected audit storage failure/,
    );
    assert.equal((await getCustomerFeeWaiverState(f.database)).revision, 0);
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests')
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
        await mutateCustomerFeeWaiver(f.database, ctx('transport', 0), command);
      await assert.rejects(
        mutateCustomerFeeWaiver(failedBatch, ctx('transport', 0), command),
        (error) => error === fault,
      );
      assert.equal(
        (await getCustomerFeeWaiverState(f.database)).revision,
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
        'INSERT INTO customer_fee_waiver_control(id,revision) VALUES (NULL,0)',
      ),
    );
    assert.throws(() =>
      f.sqlite.exec(
        "INSERT INTO customer_fee_waiver_control(id,revision) VALUES ('other',0)",
      ),
    );
  } finally {
    await f.dispose();
  }
});

void test('multiple campaigns publish and pause/resume selects the next overlap, preserving every version', async () => {
  const f = await feeWaiverFixture();
  try {
    const a = await mutateCustomerFeeWaiver(f.database, ctx('create-a', 0), {
      type: 'create',
      terms,
    });
    const b = await mutateCustomerFeeWaiver(f.database, ctx('create-b', 1), {
      type: 'create',
      terms: { ...terms, startsAt: 11 },
    });
    await mutateCustomerFeeWaiver(f.database, ctx('publish-a', 2), {
      type: 'publish',
      campaignId: a.id,
    });
    await mutateCustomerFeeWaiver(f.database, ctx('publish-b', 3), {
      type: 'publish',
      campaignId: b.id,
    });
    let state = await getCustomerFeeWaiverState(f.database);
    assert.equal(state.revision, 4);
    assert.equal(selectFeeWaiver(state.campaigns, 100)?.id, a.id);
    await mutateCustomerFeeWaiver(f.database, ctx('pause-a', 4), {
      type: 'pause',
      campaignId: a.id,
    });
    state = await getCustomerFeeWaiverState(f.database);
    assert.equal(selectFeeWaiver(state.campaigns, 100)?.id, b.id);
    await mutateCustomerFeeWaiver(f.database, ctx('resume-a', 5), {
      type: 'resume',
      campaignId: a.id,
    });
    const revised = await mutateCustomerFeeWaiver(
      f.database,
      ctx('revise-a', 6),
      {
        type: 'revise',
        campaignId: a.id,
        terms: { ...terms, name: 'Revised launch' },
      },
    );
    assert.equal(revised.revision, 5);
    assert.equal(revised.state, 'published');
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT name FROM customer_fee_waiver_revisions WHERE campaign_id=? AND revision=2',
        )
        .get(a.id)?.name,
      'Global launch',
    );
    assert.throws(() =>
      f.sqlite.exec("UPDATE customer_fee_waiver_revisions SET name='changed'"),
    );
    assert.throws(() =>
      f.sqlite.exec('DELETE FROM customer_fee_waiver_revisions'),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'customer.service-fee-waiver.%'",
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
    const original = await mutateCustomerFeeWaiver(
      f.database,
      ctx('create', 0),
      command,
    );
    await mutateCustomerFeeWaiver(f.database, ctx('publish', 1), {
      type: 'publish',
      campaignId: original.id,
    });
    assert.deepEqual(
      await mutateCustomerFeeWaiver(
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
        mutateCustomerFeeWaiver(f.database, ctx('create', 0), changed),
      );
    await assert.rejects(
      mutateCustomerFeeWaiver(f.database, ctx('create', 1), command),
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(
        f.database,
        ctx('create', 0, { authSubject: 'wrong' }),
        command,
      ),
    );
    f.sqlite.exec(
      "DELETE FROM user_roles WHERE user_id='owner' AND role='super_admin'",
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(f.database, ctx('create', 0), command),
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests')
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
      mutateCustomerFeeWaiver(
        f.database,
        ctx('admin', 0, { actorId: 'staff', authSubject: 'staff' }),
        command,
      ),
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(f.database, ctx('stale', 1), command),
    );
    f.sqlite.exec(
      "CREATE TRIGGER reject_fee_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END",
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(f.database, ctx('audit', 0), command),
    );
    f.sqlite.exec('DROP TRIGGER reject_fee_audit');
    const raced = interleaveFeeWaiverBatch(f.database, async () => {
      f.sqlite.exec("DELETE FROM user_roles WHERE user_id='owner'");
    });
    await assert.rejects(
      mutateCustomerFeeWaiver(raced, ctx('revoked', 0), command),
    );
    for (const table of [
      'customer_fee_waiver_campaigns',
      'customer_fee_waiver_revisions',
      'customer_fee_waiver_requests',
      'staff_permission_guards',
    ])
      assert.equal(
        f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n,
        0,
      );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'customer.service-fee-waiver.%'",
        )
        .get()?.n,
      0,
    );
    assert.equal((await getCustomerFeeWaiverState(f.database)).revision, 0);
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
      winner = await mutateCustomerFeeWaiver(
        f.database,
        ctx('same', 0),
        command,
      );
    });
    assert.deepEqual(
      await mutateCustomerFeeWaiver(race, ctx('same', 0), command),
      winner,
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_revisions')
        .get()?.n,
      1,
    );
    const replayRace = interleaveFeeWaiverBatch(f.database, async () => {
      f.sqlite.exec("UPDATE users SET status='suspended' WHERE id='owner'");
    });
    await assert.rejects(
      mutateCustomerFeeWaiver(replayRace, ctx('same', 0), command),
    );
  } finally {
    await f.dispose();
  }
});
void test('a concurrent publish or pause wins once and stale changes cannot overwrite it', async () => {
  const f = await feeWaiverFixture();
  try {
    const a = await mutateCustomerFeeWaiver(f.database, ctx('create', 0), {
      type: 'create',
      terms,
    });
    const race = interleaveFeeWaiverBatch(f.database, () =>
      mutateCustomerFeeWaiver(f.database, ctx('winner', 1), {
        type: 'publish',
        campaignId: a.id,
      }),
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(race, ctx('loser', 1), {
        type: 'publish',
        campaignId: a.id,
      }),
    );
    const pauseRace = interleaveFeeWaiverBatch(f.database, () =>
      mutateCustomerFeeWaiver(f.database, ctx('pause-winner', 2), {
        type: 'pause',
        campaignId: a.id,
      }),
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(pauseRace, ctx('revise-loser', 2), {
        type: 'revise',
        campaignId: a.id,
        terms: { ...terms, name: 'Lost change' },
      }),
    );
    assert.deepEqual(
      (await getCustomerFeeWaiverState(f.database)).campaigns.map((c) => [
        c.state,
        c.name,
        c.revision,
      ]),
      [['paused', 'Global launch', 3]],
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests')
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
    const a = await mutateCustomerFeeWaiver(f.database, ctx('create', 0), {
      type: 'create',
      terms,
    });
    await mutateCustomerFeeWaiver(f.database, ctx('publish', 1), {
      type: 'publish',
      campaignId: a.id,
    });
    await assert.rejects(
      mutateCustomerFeeWaiver(
        f.database,
        ctx('expired-pause', 2, { now: 1000 }),
        {
          type: 'pause',
          campaignId: a.id,
        },
      ),
    );
    await mutateCustomerFeeWaiver(f.database, ctx('pause', 2), {
      type: 'pause',
      campaignId: a.id,
    });
    await assert.rejects(
      mutateCustomerFeeWaiver(
        f.database,
        ctx('expired-resume', 3, { now: 1000 }),
        {
          type: 'resume',
          campaignId: a.id,
        },
      ),
    );
    await mutateCustomerFeeWaiver(f.database, ctx('end', 3), {
      type: 'end',
      campaignId: a.id,
    });
    for (const type of ['resume', 'publish', 'pause', 'end'] as const)
      await assert.rejects(
        mutateCustomerFeeWaiver(f.database, ctx(type, 4), {
          type,
          campaignId: a.id,
        }),
      );
    await assert.rejects(
      mutateCustomerFeeWaiver(f.database, ctx('revise', 4), {
        type: 'revise',
        campaignId: a.id,
        terms,
      }),
    );
  } finally {
    await f.dispose();
  }
});

void test('authorized customer state has an explicit target and rejected staff never see controls', async () => {
  const f = await feeWaiverFixture();
  try {
    assert.ok(repository);
    assert.deepEqual(
      await repository.getAuthorizedCustomerFeeWaiverState(f.database, {
        actorId: 'owner',
        authSubject: 'owner',
      }),
      { feeTarget: 'customer_service_fee', revision: 0, campaigns: [] },
    );
    await assert.rejects(
      repository.getAuthorizedCustomerFeeWaiverState(f.database, {
        actorId: 'staff',
        authSubject: 'staff',
      }),
      { code: 'unauthorized' },
    );
  } finally {
    await f.dispose();
  }
});
void test('receipt rejects a different authorized actor or changed valid auth subject', async () => {
  const f = await feeWaiverFixture();
  try {
    const command = { type: 'create', terms } as const;
    await mutateCustomerFeeWaiver(f.database, ctx('identity', 0), command);
    f.sqlite.exec(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES('staff','super_admin',1)",
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(
        f.database,
        ctx('identity', 0, { actorId: 'staff', authSubject: 'staff' }),
        command,
      ),
      { code: 'conflict' },
    );
    f.sqlite.exec(
      "UPDATE users SET auth_subject='renewed-owner' WHERE id='owner'",
    );
    await assert.rejects(
      mutateCustomerFeeWaiver(
        f.database,
        ctx('identity', 0, { authSubject: 'renewed-owner' }),
        command,
      ),
      { code: 'conflict' },
    );
    assert.equal((await getCustomerFeeWaiverState(f.database)).revision, 1);
  } finally {
    await f.dispose();
  }
});
void test('customer and legacy request identities and audit receipts remain in separate namespaces', async () => {
  const f = await feeWaiverFixture();
  try {
    const {seedLegacyRevision,seedLegacyReceipt}=await import('./helpers/legacy-fee-history-fixture');
    const {getAuthorizedFeeWaiverState}=await import('../lib/db/repositories/fee-waivers');
    const command = { type: 'create', terms } as const;
    const old=await seedLegacyRevision(f.database,{...terms,id:'legacy-receipt',revision:1,state:'draft'});
    await seedLegacyReceipt(f.database,ctx('same-key',0),command,old);
    await mutateCustomerFeeWaiver(f.database, ctx('same-key', 0), command);
    assert.equal((await getAuthorizedFeeWaiverState(f.database,{actorId:'owner',authSubject:'owner'})).revision, 1);
    assert.equal((await getCustomerFeeWaiverState(f.database)).revision, 1);
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_logs WHERE request_id IN('fee-waiver:same-key','customer-fee-waiver:same-key')",
        )
        .get()?.n,
      2,
    );
  } finally {
    await f.dispose();
  }
});
