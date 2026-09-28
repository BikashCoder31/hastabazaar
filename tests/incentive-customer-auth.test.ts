import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AuthenticatedUser } from '../app/auth';
import type { CustomerUser } from '../lib/auth/customer';

type CustomerApi = {
  requireCustomerApi(): Promise<CustomerUser>;
  requireExistingCustomerApi(): Promise<CustomerUser>;
  getCustomerUser(): Promise<CustomerUser | null>;
  requireCustomerPage(returnTo: string): Promise<CustomerUser>;
};

// Only the request identity and platform bindings are substituted. Production
// customer logic and every emitted query execute against real disposable SQL.
const compiled = build({
  entryPoints: ['lib/auth/customer.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  plugins: [
    {
      name: 'customer-request-boundaries',
      setup(bundle) {
        bundle.onResolve(
          { filter: /^(cloudflare:workers|next\/navigation|@\/app\/auth)$/ },
          ({ path }) => ({ path, namespace: 'request' }),
        );
        bundle.onLoad({ filter: /.*/, namespace: 'request' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'cloudflare:workers'
              ? 'export const env = { DB: globalThis.customerDb };'
              : path === 'next/navigation'
                ? 'export const redirect = globalThis.customerRedirect;'
                : 'export const getAuthenticatedUser = async () => globalThis.customerIdentity; export const requireAuthenticatedUser = getAuthenticatedUser;',
        }));
      },
    },
  ],
});

async function fixture(identity: AuthenticatedUser | null = signIn()) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('drizzle')
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    if (Number(name.slice(0, 4)) >= 60) continue;
    sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  }
  let beforeBatch: (() => void) | undefined;
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...input: SQLInputValue[]) {
          values = input;
          return this;
        },
        async first() {
          return statement.get(...values) ?? null;
        },
        async run() {
          return {
            meta: { changes: Number(statement.run(...values).changes) },
          };
        },
      };
    },
    async batch(statements: { run(): Promise<unknown> }[]) {
      beforeBatch?.();
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const loadedModule = { exports: {} as CustomerApi };
  runInNewContext((await compiled).outputFiles[0].text, {
    module: loadedModule,
    exports: loadedModule.exports,
    customerDb: db,
    customerIdentity: identity,
    customerRedirect: (path: string) => {
      throw new Error(`redirect:${path}`);
    },
    crypto: { randomUUID },
  });
  return {
    sqlite,
    api: loadedModule.exports,
    beforeBatch(callback: () => void) {
      beforeBatch = callback;
    },
    seed(
      roles: string[],
      options: {
        subject?: string | null;
        status?: string;
        email?: string;
      } = {},
    ) {
      sqlite
        .prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
        VALUES ('existing',?,?, '','en-NP',?,1,1)`)
        .run(
          options.subject === undefined ? 'identity' : options.subject,
          options.email ?? 'person@example.test',
          options.status ?? 'active',
        );
      for (const role of roles)
        sqlite
          .prepare(
            'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
          )
          .run('existing', role);
    },
    state() {
      return {
        users: sqlite.prepare('SELECT * FROM users ORDER BY id').all(),
        roles: sqlite
          .prepare('SELECT * FROM user_roles ORDER BY user_id,role')
          .all(),
        writes: sqlite.prepare('SELECT total_changes() AS n').get()?.n,
      };
    },
  };
}

function signIn(email = 'person@example.test'): AuthenticatedUser {
  return {
    userId: 'identity',
    displayName: 'Fictional person',
    fullName: 'Fictional person',
    email,
  };
}
function authorization(status: 401 | 403) {
  return (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as Error).name === 'CustomerAuthorizationError' &&
    (error as Error & { status: number }).status === status;
}

for (const role of ['admin', 'super_admin']) {
  for (const subject of [null, 'identity']) {
    void test(`staff-only ${role} (${subject ?? 'unlinked'}) is denied without any database writes`, async () => {
      const f = await fixture();
      try {
        f.seed([role], { subject });
        const before = f.state();
        await assert.rejects(
          () => f.api.requireCustomerApi(),
          authorization(403),
        );
        assert.deepEqual(f.state(), before);
        await assert.rejects(() => f.api.getCustomerUser(), authorization(403));
        await assert.rejects(
          () => f.api.requireCustomerPage('/account/rewards'),
          /redirect:\/account-access-denied/,
        );
        assert.deepEqual(f.state(), before);
      } finally {
        f.sqlite.close();
      }
    });
  }
}

void test('staff-only identity remains denied when its request email changes', async () => {
  const f = await fixture(signIn('changed@example.test'));
  try {
    f.seed(['admin']);
    const before = f.state();
    await assert.rejects(() => f.api.requireCustomerApi(), authorization(403));
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

for (const roles of [[], ['seller']]) {
  void test(`ordinary existing onboarding links identity and grants customer alongside ${roles.join() || 'no role'}`, async () => {
    const f = await fixture(signIn(' PERSON@EXAMPLE.TEST '));
    try {
      f.seed(roles, { subject: null });
      assert.equal((await f.api.requireCustomerApi()).userId, 'existing');
      assert.equal(
        f.sqlite
          .prepare("SELECT auth_subject FROM users WHERE id='existing'")
          .get()?.auth_subject,
        'identity',
      );
      assert.equal(
        f.sqlite
          .prepare("SELECT COUNT(*) AS n FROM user_roles WHERE role='customer'")
          .get()?.n,
        1,
      );
      for (const role of roles)
        assert.equal(
          f.sqlite
            .prepare('SELECT COUNT(*) AS n FROM user_roles WHERE role=?')
            .get(role)?.n,
          1,
        );
    } finally {
      f.sqlite.close();
    }
  });
}

void test('ordinary new onboarding creates one active customer and repeats without more writes', async () => {
  const f = await fixture();
  try {
    const customer = await f.api.requireCustomerApi();
    assert.equal(customer.email, 'person@example.test');
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get()?.n,
      1,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) AS n FROM user_roles WHERE role='customer'")
        .get()?.n,
      1,
    );
    const before = f.state();
    assert.equal((await f.api.requireCustomerApi()).userId, customer.userId);
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

for (const role of ['admin', 'super_admin', 'seller']) {
  for (const subject of [null, 'identity']) {
    void test(`existing customer plus ${role} (${subject ?? 'unlinked'}) retains customer access and roles`, async () => {
      const f = await fixture();
      try {
        f.seed(['customer', role], { subject });
        assert.equal((await f.api.requireCustomerApi()).userId, 'existing');
        const before = f.state();
        assert.equal(
          (await f.api.requireExistingCustomerApi()).userId,
          'existing',
        );
        assert.deepEqual(f.state(), before);
        assert.equal(
          f.sqlite.prepare('SELECT COUNT(*) AS n FROM user_roles').get()?.n,
          2,
        );
      } finally {
        f.sqlite.close();
      }
    });
  }
}

void test('inactive existing account is denied without identity or role writes', async () => {
  const f = await fixture();
  try {
    f.seed(['customer'], { subject: null, status: 'suspended' });
    const before = f.state();
    await assert.rejects(() => f.api.requireCustomerApi(), authorization(403));
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

void test('email linked to another identity is denied without changes', async () => {
  const f = await fixture();
  try {
    f.seed(['customer'], { subject: 'other-identity' });
    const before = f.state();
    await assert.rejects(() => f.api.requireCustomerApi(), authorization(403));
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

for (const role of ['admin', 'super_admin']) {
  for (const subject of [null, 'identity']) {
    void test(`${role} role arriving after preflight (${subject ?? 'unlinked'}) prevents identity UPDATE and customer INSERT at batch`, async () => {
      const f = await fixture();
      try {
        f.seed([], { subject });
        let atCommit: ReturnType<typeof f.state> | undefined;
        f.beforeBatch(() => {
          f.sqlite
            .prepare(
              'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,2)',
            )
            .run('existing', role);
          atCommit = f.state();
        });
        await assert.rejects(
          () => f.api.requireCustomerApi(),
          authorization(403),
        );
        assert.deepEqual(f.state(), atCommit);
      } finally {
        f.sqlite.close();
      }
    });
  }
}

void test('unlinked account email changed after preflight denies linking without provisioning writes', async () => {
  const f = await fixture();
  try {
    f.seed([], { subject: null });
    let atCommit: ReturnType<typeof f.state> | undefined;
    f.beforeBatch(() => {
      f.sqlite
        .prepare(
          "UPDATE users SET email='different@example.test' WHERE id='existing'",
        )
        .run();
      atCommit = f.state();
    });
    await assert.rejects(() => f.api.requireCustomerApi(), authorization(403));
    assert.deepEqual(f.state(), atCommit);
  } finally {
    f.sqlite.close();
  }
});

void test('subject-linked account retains onboarding when its email changes after preflight', async () => {
  const f = await fixture();
  try {
    f.seed([], { subject: 'identity' });
    f.beforeBatch(() => {
      f.sqlite
        .prepare(
          "UPDATE users SET email='different@example.test' WHERE id='existing'",
        )
        .run();
    });
    const customer = await f.api.requireCustomerApi();
    assert.equal(customer.userId, 'existing');
    assert.equal(customer.authSubject, 'identity');
    assert.equal(customer.email, 'different@example.test');
    assert.equal(
      f.sqlite
        .prepare("SELECT COUNT(*) AS n FROM user_roles WHERE role='customer'")
        .get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});

void test('inactive state arriving after preflight prevents provisioning writes at batch', async () => {
  const f = await fixture();
  try {
    f.seed([], { subject: null });
    let atCommit: ReturnType<typeof f.state> | undefined;
    f.beforeBatch(() => {
      f.sqlite
        .prepare("UPDATE users SET status='suspended' WHERE id='existing'")
        .run();
      atCommit = f.state();
    });
    await assert.rejects(() => f.api.requireCustomerApi(), authorization(403));
    assert.deepEqual(f.state(), atCommit);
  } finally {
    f.sqlite.close();
  }
});

void test('strict lookup rejects missing sign-in with 401 and performs no writes', async () => {
  const f = await fixture(null);
  try {
    const before = f.state();
    await assert.rejects(
      () => f.api.requireExistingCustomerApi(),
      authorization(401),
    );
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

for (const record of [
  'absent',
  'unlinked',
  'noncustomer',
  'staff-only',
  'inactive',
]) {
  void test(`strict lookup denies ${record} customer with 403 without provisioning or writes`, async () => {
    const f = await fixture();
    try {
      if (record !== 'absent')
        f.seed(
          record === 'staff-only'
            ? ['super_admin']
            : record === 'noncustomer'
              ? []
              : ['customer'],
          {
            subject: record === 'unlinked' ? null : 'identity',
            status: record === 'inactive' ? 'suspended' : 'active',
          },
        );
      const before = f.state();
      await assert.rejects(
        () => f.api.requireExistingCustomerApi(),
        authorization(403),
      );
      assert.deepEqual(f.state(), before);
    } finally {
      f.sqlite.close();
    }
  });
}
