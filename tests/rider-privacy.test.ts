import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = {
  role: 'admin',
  dbCalls: 0,
  identity: 'customer',
  db: null as unknown as D1Database,
};
const globals = globalThis as typeof globalThis & {
  riderPrivacyFixture: typeof fixture;
  riderPrivacyElement: typeof createElement;
};
globals.riderPrivacyFixture = fixture;
globals.riderPrivacyElement = createElement;
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'export const env={}',
      'next/link':
        'export default function Link(p){return globalThis.riderPrivacyElement("a",p)}',
      'next/navigation':
        'export function notFound(){throw Error("Not found")};export function useRouter(){return {refresh(){}}}',
      '@/lib/auth/staff':
        'export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffPage(){return {id:"admin",role:globalThis.riderPrivacyFixture.role}};export async function requireStaffApi(){return {id:"admin",role:globalThis.riderPrivacyFixture.role}}',
      '@/app/auth':
        'export async function getAuthenticatedUser(){return globalThis.riderPrivacyFixture.identity ? {userId:globalThis.riderPrivacyFixture.identity}:null}',
      '@/lib/forms/privacy':
        'export class FormPrivacyError extends Error{};export async function collectFormAnswersForPrivacy(){return [{formId:"rider.application",subjectType:"rider_application",answers:{private:"PRIVATE-IDENTITY"}}]};export async function eraseFormAnswersForPrivacy(){throw Error("Unexpected erase")}',
      '@/lib/incentives/privacy':
        'export async function collectIncentivePrivacyData(){return {}}',
      '@/lib/db/d1':
        'export function requireDatabase(){globalThis.riderPrivacyFixture.dbCalls++;if(!globalThis.riderPrivacyFixture.db)throw Error("Private database reached");return globalThis.riderPrivacyFixture.db};export function requireMediaBucket(){throw Error("Private media reached")}',
    };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});
function database(sqlite: DatabaseSync) {
  return {
    prepare(sql: string) {
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...values) ?? null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...values) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

void test('private rider evidence requires the current active Super Admin role, including for its owner', async () => {
  const { canViewRiderEvidence } = await import('../lib/riders/media-access');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE users(id TEXT,auth_subject TEXT,status TEXT);
      CREATE TABLE user_roles(user_id TEXT,role TEXT);
      CREATE TABLE rider_profiles(user_id TEXT,status TEXT,application_id TEXT);
      CREATE TABLE rider_reports(id TEXT,rider_user_id TEXT,shipping_job_id TEXT);
      CREATE TABLE shipping_parcels(shipping_job_id TEXT,rider_user_id TEXT);
      INSERT INTO users VALUES ('owner','owner','active'),('buyer','buyer','active'),('seller','seller','active'),('admin','admin','active'),('super','super','active');
      INSERT INTO user_roles VALUES ('owner','customer'),('buyer','customer'),('seller','seller'),('admin','admin'),('super','super_admin');
      INSERT INTO rider_profiles VALUES ('owner','approved','identity');
      INSERT INTO rider_reports VALUES ('proof','owner','job');
      INSERT INTO shipping_parcels VALUES ('job','owner');`);
    const db = database(sqlite);
    for (const subject of ['owner', 'buyer', 'seller', 'admin', 'unknown'])
      for (const identity of [false, true])
        assert.equal(
          await canViewRiderEvidence(
            db,
            subject,
            'owner',
            identity ? 'identity' : 'proof',
            identity,
          ),
          false,
          subject,
        );
    assert.equal(
      await canViewRiderEvidence(db, 'super', 'owner', 'proof', false),
      true,
    );
    sqlite.exec("DELETE FROM user_roles WHERE user_id='super'");
    assert.equal(
      await canViewRiderEvidence(db, 'super', 'owner', 'proof', false),
      false,
    );
    sqlite.exec(
      "INSERT INTO user_roles VALUES ('super','super_admin');UPDATE users SET status='disabled' WHERE id='super'",
    );
    assert.equal(
      await canViewRiderEvidence(db, 'super', 'owner', 'identity', true),
      false,
    );
  } finally {
    sqlite.close();
  }
});

void test('customer and seller parcel projection retains progress and amounts without rider identifiers, references or coordinates', async () => {
  const { customerParcel } = await import('../lib/operations/parcels');
  const raw = {
    id: 'job',
    sellerName: 'Maker',
    status: 'dispatched',
    method: 'own_rider',
    riderUserId: 'private-person',
    trackingCode: 'PRIVATE-HANDOVER',
    trackingUrl: 'https://private.example.invalid',
    courierName: null,
    codDuePaisa: 1200,
    collectedPaisa: 300,
    latitude: 27.7,
    longitude: 85.3,
    accuracy: 2,
    positionAt: Date.now(),
  } as Parameters<typeof customerParcel>[0];
  const projected = customerParcel(raw);
  assert.equal(projected.status, 'dispatched');
  assert.equal(projected.codDuePaisa, 1200);
  assert.equal(projected.collectedPaisa, 300);
  assert.equal(projected.method, 'delivery');
  assert.equal(projected.latitude, null);
  assert.equal(projected.longitude, null);
  assert.equal(projected.accuracy, null);
  assert.equal(projected.trackingCode, null);
  assert.equal(projected.trackingUrl, null);
  assert.doesNotMatch(
    JSON.stringify(projected),
    /private-person|PRIVATE-HANDOVER|own_rider/,
  );
  const courier = customerParcel({
    ...raw,
    method: 'courier',
    courierName: 'Courier',
    trackingCode: 'PUBLIC',
    trackingUrl: 'https://courier.example.invalid',
  });
  assert.equal(courier.courierName, 'Courier');
  assert.equal(courier.trackingCode, 'PUBLIC');
});

void test('rider notification list/read/email source filtering excludes customer, seller and Admin recipients', async () => {
  const { riderNotificationSourceSql } =
    await import('../lib/operations/rider-notification-access');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE users(id TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);
      CREATE TABLE notification_messages(id TEXT,related_type TEXT,related_id TEXT,audience_role TEXT,recipient_user_id TEXT);
      CREATE TABLE rider_profiles(user_id TEXT,status TEXT);CREATE TABLE rider_reports(id TEXT,rider_user_id TEXT,shipping_job_id TEXT,status TEXT,assignment_version INTEGER);
      CREATE TABLE shipping_parcels(shipping_job_id TEXT,rider_user_id TEXT,method TEXT,version INTEGER);CREATE TABLE shipping_jobs(id TEXT,status TEXT);
      INSERT INTO users VALUES ('owner','active'),('seller','active'),('admin','active'),('super','active');
      INSERT INTO user_roles VALUES ('owner','customer'),('seller','seller'),('admin','admin'),('super','super_admin');
      INSERT INTO rider_profiles VALUES ('owner','submitted');
      INSERT INTO notification_messages VALUES ('owner-rider','rider_profile','owner','customer','owner'),('seller-rider','rider_profile','owner','seller','seller'),('admin-rider','rider_profile','owner','staff','admin'),('super-rider','rider_profile','owner','staff','super'),('normal-order','order','order','customer','owner');`);
    const result = sqlite
      .prepare(
        'SELECT n.id FROM notification_messages n WHERE ' +
          riderNotificationSourceSql() +
          ' ORDER BY n.id',
      )
      .all();
    assert.deepEqual(
      result.map((row) => row.id),
      ['normal-order', 'super-rider'],
    );
    sqlite.exec("DELETE FROM user_roles WHERE user_id='super'");
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT n.id FROM notification_messages n WHERE ' +
            riderNotificationSourceSql(),
        )
        .all()
        .map((row) => row.id),
      ['normal-order'],
    );
  } finally {
    sqlite.close();
  }
});

void test('private rider answers reject owner and ordinary Admin before resolving private parent records', async () => {
  const { authorizeFormAnswerRead } = await import('../lib/forms/access');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE users(id TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);
      INSERT INTO users VALUES ('owner','active'),('seller','active'),('admin','active');
      INSERT INTO user_roles VALUES ('owner','customer'),('seller','seller'),('admin','admin');`);
    const db = database(sqlite);
    for (const [id, role] of [
      ['owner', 'customer'],
      ['seller', 'seller'],
      ['admin', 'admin'],
    ] as const)
      for (const [formId, subjectType] of [
        ['rider.application', 'rider_application'],
        ['rider.report', 'rider_report'],
        ['rider.remittance', 'parcel_cash_record'],
        ['rider.code-verify', 'rider_event'],
        ['staff.rider-control-1', 'rider_report'],
        ['staff.rider-control-2', 'rider_policy'],
      ])
        assert.equal(
          await authorizeFormAnswerRead(
            db,
            { id, role },
            {
              id: 'answer',
              formId,
              subjectType,
              subjectId: 'private',
              actorId: 'owner',
              requestId: 'request',
            },
          ),
          false,
        );
  } finally {
    sqlite.close();
  }
});

void test('only Super Admin navigation and notification permissions include rider operations', async () => {
  const { adminNavigation } = await import('../lib/admin/navigation');
  const { canViewStaffNotification } =
    await import('../lib/operations/notification-links');
  assert.equal(
    adminNavigation('admin').some((item) => item.href === '/admin/riders'),
    false,
  );
  assert.equal(
    adminNavigation('super_admin').some(
      (item) => item.href === '/admin/riders',
    ),
    true,
  );
  assert.equal(
    canViewStaffNotification({ role: 'admin' }, 'rider_report', 'order.manage'),
    false,
  );
  assert.equal(
    canViewStaffNotification(
      { role: 'super_admin' },
      'rider_report',
      'order.manage',
    ),
    true,
  );
});

void test('ordinary Admin direct rider pages and mutations are denied before reading rider data', async () => {
  fixture.role = 'admin';
  fixture.dbCalls = 0;
  fixture.db = null as unknown as D1Database;
  const { default: Page } = await import('../app/admin/riders/page');
  const { default: History } =
    await import('../app/admin/riders/form-history/page');
  await assert.rejects(Page(), /Not found/);
  for (const kind of ['application', 'report', 'remittance', 'code'])
    await assert.rejects(
      History({ searchParams: Promise.resolve({ kind }) }),
      /Not found/,
    );
  const { POST } = await import('../app/api/admin/riders/route');
  const response = await POST(
    new Request('http://localhost:4331/api/admin/riders', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4331',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'confirm' }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(fixture.dbCalls, 0);
});

void test('customer parcel UI never renders rider maps or rider-specific copy, while courier links remain', async () => {
  const { ParcelList } = await import('../components/delivery/parcel-list');
  const { customerParcel } = await import('../lib/operations/parcels');
  const p = {
    id: 'job',
    sellerName: 'Maker',
    status: 'dispatched',
    method: 'own_rider',
    codDuePaisa: 100,
    collectedPaisa: 0,
    courierName: null,
    trackingCode: null,
    trackingUrl: null,
    latitude: 27.7,
    longitude: 85.3,
    accuracy: 2,
    positionAt: Date.now(),
  } as Parameters<typeof customerParcel>[0];
  const html = renderToStaticMarkup(
    createElement(ParcelList, { parcels: [customerParcel(p)] }),
  );
  assert.match(html, /dispatched|Maker/);
  assert.doesNotMatch(html, /rider|iframe|leaflet|openstreetmap/i);
});

void test('customer legacy delivery projection removes rider metadata without mutating retained records', async () => {
  const { publicDelivery } = await import('../lib/delivery/repository');
  const original = {
    method: 'own_rider',
    courierName: null,
    trackingUrl: null,
    trackingReference: 'PRIVATE',
    latitude: 27.7,
    longitude: 85.3,
    accuracy: 2,
    positionAt: Date.now(),
    orderStatus: 'dispatched',
  };
  const safe = publicDelivery(original);
  assert.equal(safe?.orderStatus, 'dispatched');
  assert.equal(safe?.method, 'delivery');
  assert.equal(safe?.latitude, null);
  assert.equal(safe?.positionAt, null);
  assert.equal(safe?.trackingReference, null);
  assert.equal(original.trackingReference, 'PRIVATE');
  assert.equal(original.latitude, 27.7);
});
void test('private rider media URL rejects ordinary account roles before querying its record or bucket', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(
      "CREATE TABLE users(id TEXT,auth_subject TEXT,status TEXT);CREATE TABLE user_roles(user_id TEXT,role TEXT);INSERT INTO users VALUES ('owner','owner','active');INSERT INTO user_roles VALUES ('owner','customer')",
    );
    fixture.identity = 'owner';
    fixture.db = database(sqlite);
    const { GET } = await import('../app/api/rider/media/[id]/route');
    for (const suffix of ['', '?kind=identity'])
      assert.equal(
        (
          await GET(
            new Request(
              'http://localhost:4331/api/rider/media/private' + suffix,
            ),
            { params: Promise.resolve({ id: 'private' }) },
          )
        ).status,
        404,
      );
  } finally {
    sqlite.close();
    fixture.db = null as unknown as D1Database;
  }
});
void test('ordinary support Admin cannot export rider answers through an assigned access request', async () => {
  fixture.role = 'admin';
  fixture.db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('data_rights_requests'))
                return {
                  customerId: 'owner',
                  requestType: 'access',
                  status: 'approved',
                  assignedTo: 'admin',
                };
              if (sql.includes('audit_logs')) return null;
              throw Error('Unexpected private export query');
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const { POST } = await import('../app/api/admin/privacy/[id]/route');
  const response = await POST(
    new Request('http://localhost:4331/api/admin/privacy/private', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4331',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'export_answers',
        requestId: 'private-export',
      }),
    }),
    { params: Promise.resolve({ id: 'private' }) },
  );
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /PRIVATE-IDENTITY/);
  fixture.db = null as unknown as D1Database;
});
void test('shared shipping lists redact rider handover references but retain courier references and statuses', async () => {
  const { listShippingJobs } =
    await import('../lib/db/repositories/operations');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE orders(id TEXT,order_number TEXT);CREATE TABLE seller_profiles(id TEXT,trading_name TEXT);
   CREATE TABLE shipping_jobs(id TEXT,order_id TEXT,seller_id TEXT,direction TEXT,status TEXT,label_reference TEXT,tracking_code TEXT,pickup_window_start INTEGER,pickup_window_end INTEGER,claim_reference TEXT,reconciliation_status TEXT,reconciliation_note TEXT,updated_at INTEGER);
   CREATE TABLE shipping_parcels(shipping_job_id TEXT,method TEXT,rider_user_id TEXT);
   INSERT INTO orders VALUES ('order','HB-TEST');INSERT INTO seller_profiles VALUES ('seller','Maker');
   INSERT INTO shipping_jobs VALUES ('rider-job','order','seller','outbound','dispatched','PRIVATE-LABEL','PRIVATE-HANDOVER',NULL,NULL,'PRIVATE-CLAIM','pending','PRIVATE-NOTE',2),('courier-job','order','seller','outbound','dispatched','LABEL','PUBLIC-TRACK',NULL,NULL,'CLAIM','pending','NOTE',1);
   INSERT INTO shipping_parcels VALUES ('rider-job','own_rider','private-rider'),('courier-job','courier',NULL);`);
    const rows = await listShippingJobs(database(sqlite), 'seller');
    assert.equal(rows[0].status, 'dispatched');
    assert.equal(rows[0].trackingCode, null);
    assert.equal(rows[0].labelReference, null);
    assert.equal(rows[0].claimReference, null);
    assert.equal(rows[0].reconciliationNote, null);
    assert.equal(rows[1].trackingCode, 'PUBLIC-TRACK');
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE-|private-rider/);
    assert.equal(
      (await listShippingJobs(database(sqlite), undefined, true))[0]
        .trackingCode,
      'PRIVATE-HANDOVER',
    );
  } finally {
    sqlite.close();
  }
});

void test('shared receipt, seller and order-tracker references hide legacy and parcel rider handovers', async () => {
  const { publicTrackingReferenceSql } =
    await import('../lib/riders/public-tracking');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE orders(id TEXT);CREATE TABLE shipments(order_id TEXT,tracking_code TEXT);CREATE TABLE delivery_assignments(order_id TEXT,method TEXT,rider_user_id TEXT);CREATE TABLE shipping_jobs(id TEXT,order_id TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT,method TEXT,rider_user_id TEXT);
   INSERT INTO orders VALUES ('legacy'),('parcel'),('courier');INSERT INTO shipments VALUES ('legacy','PRIVATE-LEGACY'),('parcel','PRIVATE-PARCEL'),('courier','PUBLIC-COURIER');
   INSERT INTO delivery_assignments VALUES ('legacy','own_rider','private-rider'),('courier','courier',NULL);INSERT INTO shipping_jobs VALUES ('private-job','parcel');INSERT INTO shipping_parcels VALUES ('private-job','own_rider','private-rider');`);
    const rows = sqlite
      .prepare(
        'SELECT orders.id,' +
          publicTrackingReferenceSql('orders.id', 'shipments.tracking_code') +
          ' AS reference FROM orders JOIN shipments ON shipments.order_id=orders.id ORDER BY orders.id',
      )
      .all();
    assert.deepEqual(
      rows.map((row) => [row.id, row.reference]),
      [
        ['courier', 'PUBLIC-COURIER'],
        ['legacy', null],
        ['parcel', null],
      ],
    );
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE-|private-rider/);
    const tracker = sqlite
      .prepare(
        'SELECT o.id,' +
          publicTrackingReferenceSql('o.id', 's.tracking_code') +
          ' AS reference FROM orders o JOIN shipments s ON s.order_id=o.id ORDER BY o.id',
      )
      .all();
    assert.deepEqual(tracker, rows);
  } finally {
    sqlite.close();
  }
});
