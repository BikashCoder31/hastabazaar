import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { AuthenticatedUser } from '../app/auth';
import type { CustomerUser } from '../lib/auth/customer';

type CustomerApi = {
  requireCustomerApi(): Promise<CustomerUser>;
  requireExistingCustomerApi(): Promise<CustomerUser>;
  getCustomerUser(): Promise<CustomerUser | null>;
  requireCustomerPage(returnTo: string): Promise<CustomerUser>;
};

// Customer authorization and its emitted queries execute against real disposable SQL.
const publicRouteDependencies: Record<string, string> = {
  '@/lib/db/repositories/products': `
    export const getPublishedProductBySlug = async () => ({
      id: 'cup', slug: 'cup', nameEn: 'Fictional cup', media: [],
    });
    export const getUnavailablePublishedProductBySlug = async () => null;
    export const listPublishedProducts = async () => [];
  `,
  '@/lib/db/repositories/customers': `
    export const listPublishedReviews = async () => [];
    export const isWishlisted = async (_, id) => id === 'existing';
    export const getReviewableOrderItem = async (_, id) =>
      id === 'existing' ? { orderItemId: 'delivered-item', orderNumber: 'order' } : null;
    export class CustomerDataConflictError extends Error {}
    export const setWishlistItem = async () => {};
  `,
  '@/lib/db/repositories/delivery-rates': 'export const getDeliveryRates = async () => [];',
  '@/lib/db/repositories/review-extras':
    'export const getReviewExtras = async () => ({ photos: [], replies: [] });',
  '@/lib/seo/discovery': `
    export const publicUrl = (path) => path;
    export const productStructuredData = () => ({});
    export const safeJsonLd = JSON.stringify;
    export const publishedRating = async () => ({ count: 0, average: null });
  `,
  '@/lib/db/repositories/recently-viewed': `
    export const listRecentlyViewedProducts = async (_, { userId }) => [{ id: userId }];
    export const recordRecentlyViewedProduct = async (_, { userId }) => userId === 'existing';
    export const resolveRecentlyViewedProducts = async () => [];
    export const clearRecentlyViewed = async () => {};
  `,
  '@/lib/db/repositories/business-settings':
    'export const getEffectiveBusinessSetting = async () => ({ value: { maxItems: 12, retentionDays: 90 } });',
  'cloudflare:workers': 'export const env = { DB: globalThis.customerDb };',
  'next/navigation': `
    export const redirect = globalThis.customerRedirect;
    export const notFound = () => redirect('/404');
    export const useRouter = () => ({ refresh() {} });
  `,
  '@/app/auth': `
    export async function getAuthenticatedUser(options) {
      globalThis.authCalls.push(Boolean(options?.readOnly));
      return globalThis.customerIdentity;
    }
    export const requireAuthenticatedUser = getAuthenticatedUser;
    export const signInPath = (path) => '/login?return_to=' + encodeURIComponent(path);
  `,
};
const publicWidgets = `
  const unusedWidget = () => null;
  export const ProductOfferProvider = ({ children }) => children;
  export const OfferAddToCart = unusedWidget, ProductOfferPrice = unusedWidget, ProductCard = unusedWidget,
    ProductDelivery = unusedWidget, ProductGallery = unusedWidget, SiteFooter = unusedWidget,
    SiteHeader = unusedWidget, ReviewForm = unusedWidget, ReviewPhotos = unusedWidget,
    PublicSellerReply = unusedWidget;
  export const RecentlyViewed = ({ authenticated }) =>
    authenticated ? 'Customer view history' : 'Guest view history';
`;
const compiled = build({
  entryPoints: {
    customer: 'lib/auth/customer.ts',
    'public-product-page': 'app/products/[slug]/page.tsx',
    'recently-viewed-route': 'app/api/recently-viewed/route.ts',
    'wishlist-route': 'app/api/account/wishlist/route.ts',
  },
  outdir: 'customer-fixture',
  jsx: 'automatic',
  external: ['react', 'react/*'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  plugins: [
    {
      name: 'customer-request-boundaries',
      setup(bundle) {
        stubFixtureLink(bundle);
        bundle.onResolve({ filter: /.*/ }, ({ path }) =>
          path in publicRouteDependencies ? { path, namespace: 'public-data' } : undefined,
        );
        bundle.onLoad({ filter: /.*/, namespace: 'public-data' }, ({ path }) => ({
          loader: 'js',
          contents: publicRouteDependencies[path],
        }));
        bundle.onResolve({ filter: /^@\/components\// }, ({ path }) =>
          ['@/components/account/wishlist-button', '@/components/ui/button'].includes(path)
            ? undefined
            : { path, namespace: 'public-widget' },
        );
        bundle.onLoad({ filter: /.*/, namespace: 'public-widget' }, () => ({
          loader: 'js',
          contents: publicWidgets,
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
  const bundles = (await compiled).outputFiles;
  const authCalls: boolean[] = [];
  function load<T>(name: string): T {
    const output = bundles.find(({ path }) => basename(path) === name + '.js');
    assert.ok(output, name);
    const loadedModule = { exports: {} as T };
    runInNewContext(output.text, {
      module: loadedModule,
      exports: loadedModule.exports,
      require: createRequire(import.meta.url),
      process,
      Request,
      Response,
      TextEncoder,
      customerDb: db,
      customerIdentity: identity,
      authCalls,
      customerRedirect: (path: string) => {
        throw new Error(`redirect:${path}`);
      },
      crypto: { randomUUID, subtle: crypto.subtle },
    });
    return loadedModule.exports;
  }
  return {
    sqlite,
    authCalls,
    api: load<CustomerApi>('customer'),
    async renderPublicProduct() {
      const page = load<{
        default(props: { params: Promise<{ slug: string }> }): Promise<ReactNode>;
      }>('public-product-page');
      return renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: 'cup' }) }));
    },
    history: () => load<{
      GET(): Promise<Response>;
      POST(request: Request): Promise<Response>;
      DELETE(request: Request): Promise<Response>;
    }>('recently-viewed-route'),
    wishlist: () => load<{ PUT(request: Request): Promise<Response> }>('wishlist-route'),
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

void test('a seller-only public product view leaves their roles untouched until an explicit dashboard visit', async () => {
  const f = await fixture();
  try {
    f.seed(['seller']);
    const before = f.state();
    const html = await f.renderPublicProduct();
    assert.deepEqual(f.state(), before);
    assert.match(html, /<button[^>]+aria-pressed="false"[^>]+aria-label="Save to wishlist"/);
    assert.doesNotMatch(html, /return_to=|Review this item/);
    assert.match(html, /Guest view history/);
    assert.deepEqual(f.authCalls, [true]);

    const deliberateVisit = Date.now();
    assert.equal((await f.api.requireCustomerPage('/account')).userId, 'existing');
    const after = f.state();
    const customerRole = after.roles.find((row) => row.role === 'customer');
    assert.equal(customerRole?.user_id, 'existing');
    assert.equal(customerRole?.assigned_at, after.users[0].updated_at);
    assert.ok(Number(customerRole?.assigned_at) >= deliberateVisit);
    assert.equal(after.roles.length, 2);
  } finally {
    f.sqlite.close();
  }
});

void test('an existing customer can still see a saved product and review eligibility', async () => {
  const f = await fixture();
  try {
    f.seed(['customer']);
    const before = f.state();
    const html = await f.renderPublicProduct();
    assert.match(html, /<button[^>]+aria-pressed="true"[^>]+aria-label="Remove from wishlist"/);
    assert.match(html, /Review this item/);
    assert.match(html, /Customer view history/);
    assert.deepEqual(f.authCalls, [true]);
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

void test('a guest product view leads to sign-in and guest history without account writes', async () => {
  const f = await fixture(null);
  try {
    const before = f.state();
    const html = await f.renderPublicProduct();
    assert.match(html, /<a href="\/login\?return_to=%2Fproducts%2Fcup"/);
    assert.doesNotMatch(html, /aria-pressed=|Review this item/);
    assert.match(html, /Guest view history/);
    assert.deepEqual(f.authCalls, [true]);
    const response = await f.history().GET();
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { authenticated: boolean }).authenticated, false);
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

function wishlistSaveRequest(): Request {
  return new Request('http://fixture.invalid/api/account/wishlist', {
    method: 'PUT', body: JSON.stringify({ productId: 'cup', saved: true }),
  });
}

void test('a signed-in seller can intentionally save a product', async () => {
  const f = await fixture();
  try {
    f.seed(['seller']);
    const response = await f.wishlist().PUT(wishlistSaveRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { saved: true });
    assert.deepEqual(f.state().roles.map(({ role }) => role), ['customer', 'seller']);
  } finally {
    f.sqlite.close();
  }
});

void test('a staff-only identity cannot gain customer privileges from a wishlist save', async () => {
  const f = await fixture();
  try {
    f.seed(['super_admin']);
    const before = f.state();
    const response = await f.wishlist().PUT(wishlistSaveRequest());
    assert.equal(response.status, 403);
    assert.deepEqual(f.state(), before);
  } finally {
    f.sqlite.close();
  }
});

void test('a background history fetch returns guest history for a seller without provisioning', async () => {
  const f = await fixture();
  try {
    f.seed(['seller']);
    const before = f.state();
    const response = await f.history().GET();
    assert.equal(response.status, 200);
    assert.deepEqual(f.state(), before);
    assert.deepEqual(await response.json(), {
      products: [], policy: { maxItems: 12, retentionDays: 90 }, authenticated: false,
    });
  } finally {
    f.sqlite.close();
  }
});

function historyRecordRequest(): Request {
  return new Request('http://fixture.invalid/api/recently-viewed', {
    method: 'POST', body: JSON.stringify({ action: 'record', productId: 'cup' }),
  });
}

void test('a background history record requires an existing customer role', async () => {
  const f = await fixture();
  try {
    f.seed(['seller']);
    const { users, roles } = f.state();
    const response = await f.history().POST(historyRecordRequest());
    assert.deepEqual(f.state().users, users);
    assert.deepEqual(f.state().roles, roles);
    assert.equal(response.status, 403);
  } finally {
    f.sqlite.close();
  }
});

function historyClearRequest(): Request {
  return new Request('http://fixture.invalid/api/recently-viewed', { method: 'DELETE' });
}

void test('clearing customer view history cannot create a customer role', async () => {
  const f = await fixture();
  try {
    f.seed(['seller']);
    const before = f.state();
    const response = await f.history().DELETE(historyClearRequest());
    assert.deepEqual(f.state(), before);
    assert.equal(response.status, 403);
  } finally {
    f.sqlite.close();
  }
});

void test('an existing customer can still record and retrieve recent views', async () => {
  const f = await fixture();
  try {
    f.seed(['customer']);
    const { users, roles } = f.state();
    const response = await f.history().GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      products: [{ id: 'existing' }], policy: { maxItems: 12, retentionDays: 90 }, authenticated: true,
    });
    const record = await f.history().POST(historyRecordRequest());
    assert.equal(record.status, 200);
    assert.equal((await record.json() as { recorded: boolean }).recorded, true);
    const clear = await f.history().DELETE(historyClearRequest());
    assert.equal(clear.status, 200);
    assert.deepEqual(await clear.json(), { cleared: true });
    assert.deepEqual(f.state().users, users);
    assert.deepEqual(f.state().roles, roles);
  } finally {
    f.sqlite.close();
  }
});
