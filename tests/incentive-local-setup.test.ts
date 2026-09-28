import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeIncentiveConfigs } from '../scripts/form-catalog-local-setup.mjs';
import {
  stagingMarker,
  resolveDisposableStagingPaths,
} from '../scripts/staging/guards.mjs';

const safe = {
  HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  APP_ORIGIN: 'http://localhost:4173',
  HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated',
  HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test',
};
const ids = ['staff.promo-code', 'commerce.promo-quote'];
const combinedIds = [
  ...ids,
  'staff.loyalty-settings',
  'account.daily-reward',
  'account.points-redemption',
];
async function fixture(
  options: {
    phase?: 'promo' | 'combined';
    marked?: boolean;
    existing?: boolean;
    draft?: boolean;
    disconnected?: boolean;
  } = {},
) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'incentive-setup-'));
  const paths = resolveDisposableStagingPaths(projectRoot, safe);
  await mkdir(paths.state, { recursive: true });
  if (options.marked !== false)
    await writeFile(paths.marker, JSON.stringify(stagingMarker(paths)));
  const existing = [
    {
      id: 'existing',
      form_id: 'staff.catalog',
      config_json: '{"fields":["retained"]}',
      version: 4,
      status: 'published',
    },
  ];
  const phase = options.phase ?? 'promo';
  const fixtureIds = phase === 'combined' ? combinedIds : ids;
  const forms = fixtureIds.map((id, index) => ({
    definition: {
      id,
      adapterId: options.disconnected ? undefined : id,
      capabilities: {
        answerBehavior:
          index === 0 || id === 'staff.loyalty-settings' ? 'record' : 'none',
        customFieldTypes:
          index === 0 || id === 'staff.loyalty-settings' ? ['short_text'] : [],
      },
    },
    publishedVersion: options.existing ? 3 : 0,
    draftVersion: options.draft ? 1 : 0,
  }));
  const mutations: string[] = [];
  const configRows = structuredClone(existing);
  const domain = {
    sellers: 3,
    orders: 5,
    payments: 2,
    messages: 0,
    campaigns: 0,
    carts: 7,
  };
  async function request(
    path: string,
    options?: { method?: string; json?: Record<string, unknown> },
  ) {
    if (!options?.method || options.method === 'GET') return { forms };
    assert.match(
      path,
      /^\/api\/admin\/forms\/(staff\.promo-code|commerce\.promo-quote|staff\.loyalty-settings|account\.daily-reward|account\.points-redemption)\/(draft|publish)$/,
    );
    mutations.push(path);
    const formId = path.split('/')[4];
    assert.equal(options.json?.expectedPublishedVersion, 0);
    if (path.endsWith('/draft')) {
      assert.deepEqual(options.json?.config, { formId, fields: [] });
      return { draft: { id: formId + '-draft', revision: 1 } };
    }
    forms.find((f) => f.definition.id === formId)!.publishedVersion = 1;
    configRows.push({
      id: formId + '-draft',
      form_id: formId,
      config_json: '{"fields":[]}',
      version: 1,
      status: 'published',
    });
    return {
      published: { id: formId + '-draft', status: 'published', version: 1 },
    };
  }
  return {
    projectRoot,
    paths,
    forms,
    mutations,
    existing,
    configRows,
    domain,
    request,
    input: {
      projectRoot,
      environment: safe,
      request,
      readSnapshot: async () => ({
        published: structuredClone(configRows),
        domain: structuredClone(domain),
      }),
      phase,
    },
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
  };
}

void test('initialization preserves existing configuration and covers every new ID', async () => {
  const f = await fixture();
  try {
    const existingBefore = structuredClone(f.existing);
    const before = structuredClone(f.domain);
    const result = await initializeIncentiveConfigs(f.input);
    assert.deepEqual(result.missingFormIds, []);
    assert.deepEqual(result.initializedFormIds, ids);
    const existingAfter = f.configRows.filter((r) => r.id === 'existing');
    assert.deepEqual(existingAfter, existingBefore);
    const domainMutationCount = Object.keys(before).filter(
      (k) =>
        before[k as keyof typeof before] !== f.domain[k as keyof typeof before],
    ).length;
    assert.equal(domainMutationCount, 0);
    assert.equal(f.mutations.length, 4);
    assert.deepEqual(result.absentFutureIds.sort(), [
      'account.daily-reward',
      'account.points-redemption',
      'staff.loyalty-settings',
    ]);
    await initializeIncentiveConfigs(f.input);
    assert.equal(
      f.mutations.length,
      4,
      'second initialization publishes nothing',
    );
  } finally {
    await f.cleanup();
  }
});
for (const [name, change, marked] of [
  ['non-loopback', { APP_ORIGIN: 'https://example.com' }, true],
  ['production', { HASTABAZAAR_RUNTIME_ENV: 'production' }, true],
  ['unmarked', {}, false],
  ['remote binding', { DB_HOST: 'remote.test' }, true],
] as const)
  void test(`${name} context refuses before mutation`, async () => {
    const f = await fixture({ marked });
    try {
      await assert.rejects(() =>
        initializeIncentiveConfigs({
          ...f.input,
          environment: { ...safe, ...change },
        }),
      );
      assert.equal(f.mutations.length, 0);
    } finally {
      await f.cleanup();
    }
  });
void test('published incentive configuration and existing draft remain unchanged', async () => {
  const f = await fixture({ existing: true, draft: true });
  try {
    await initializeIncentiveConfigs(f.input);
    assert.equal(f.mutations.length, 0);
    assert.ok(
      f.forms.every((f) => f.publishedVersion === 3 && f.draftVersion === 1),
    );
  } finally {
    await f.cleanup();
  }
});
for (const option of ['draft', 'disconnected'] as const)
  void test(`${option} unpublished form refuses before any configuration write`, async () => {
    const f = await fixture({ [option]: true });
    try {
      await assert.rejects(() => initializeIncentiveConfigs(f.input));
      assert.equal(f.mutations.length, 0);
    } finally {
      await f.cleanup();
    }
  });
void test('promo phase requires both real adapters and refuses future combined readiness', async () => {
  const f = await fixture();
  try {
    f.forms.pop();
    await assert.rejects(() => initializeIncentiveConfigs(f.input));
    await assert.rejects(() =>
      initializeIncentiveConfigs({ ...f.input, phase: 'combined' }),
    );
    assert.equal(f.mutations.length, 0);
  } finally {
    await f.cleanup();
  }
});

void test('combined initialization preserves existing configuration and domain state and repeats without writes', async () => {
  const f = await fixture({ phase: 'combined' });
  try {
    const existingBefore = structuredClone(f.existing);
    const domainBefore = structuredClone(f.domain);
    const result = await initializeIncentiveConfigs(f.input);
    assert.equal(result.phase, 'combined');
    assert.deepEqual(
      [...result.initializedFormIds].sort(),
      [...combinedIds].sort(),
    );
    assert.deepEqual(result.missingFormIds, []);
    assert.deepEqual(result.absentFutureIds, []);
    assert.deepEqual(
      f.configRows.filter((row) => row.id === 'existing'),
      existingBefore,
    );
    assert.deepEqual(f.domain, domainBefore);
    assert.equal(f.mutations.length, 10);
    assert.ok(f.forms.every((form) => form.publishedVersion === 1));
    const publishedBeforeRepeat = structuredClone(f.configRows);
    const repeated = await initializeIncentiveConfigs(f.input);
    assert.deepEqual(repeated.initializedFormIds, []);
    assert.equal(
      f.mutations.length,
      10,
      'repeat initialization publishes nothing',
    );
    assert.deepEqual(f.configRows, publishedBeforeRepeat);
    assert.deepEqual(f.domain, domainBefore);
  } finally {
    await f.cleanup();
  }
});
void test('combined initialization refuses a disconnected required loyalty adapter before any write', async () => {
  const f = await fixture({ phase: 'combined' });
  try {
    f.forms.find(
      (form) => form.definition.id === 'staff.loyalty-settings',
    )!.definition.adapterId = undefined;
    const publishedBefore = structuredClone(f.configRows);
    const domainBefore = structuredClone(f.domain);
    await assert.rejects(
      () => initializeIncentiveConfigs(f.input),
      /staff\.loyalty-settings must have its actual connected adapter/,
    );
    assert.equal(f.mutations.length, 0);
    assert.deepEqual(f.configRows, publishedBefore);
    assert.deepEqual(f.domain, domainBefore);
  } finally {
    await f.cleanup();
  }
});
