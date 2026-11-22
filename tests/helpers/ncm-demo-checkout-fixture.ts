import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import './public-checkout-runtime';
import { publicCheckoutFixture } from './public-checkout-fixture';
import { readyCheckoutSeller } from './checkout-contact';
import { addCartItem, getCart } from '../../lib/db/repositories/cart';

const demoToken = 'f'.repeat(40);
export const reviewedRoutes = [
  { sellerId: 'registered', originBranch: 'POKHARA', destinationBranch: 'TINKUNE', amountPaisa: 17_000 },
  { sellerId: 'secondary', originBranch: 'BIRGUNJ', destinationBranch: 'TINKUNE', amountPaisa: 21_000 },
];

export async function ncmDemoCheckoutFixture(t: TestContext) {
  const fixture = await publicCheckoutFixture();
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    globalThis.publicCheckoutNcmDemoToken = undefined;
    globalThis.publicCheckoutNcmDemoPickupBranches = undefined;
    globalThis.publicCheckoutEnvironment = undefined;
    globalThis.publicCheckoutActor = null;
    fixture.dispose();
  });
  globalThis.publicCheckoutDb = fixture.db;
  globalThis.publicCheckoutActor = {
    userId: 'customer', authSubject: 'customer', email: 'customer@local.hastabazaar.test',
  };
  globalThis.publicCheckoutNcmDemoToken = demoToken;
  fixture.sqlite.exec(`
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
      registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,
      province,district,municipality,locality,status,created_at,updated_at)
    SELECT 'secondary','foreign','Fictional Birgunj Seller','Fictional Birgunj Store','Fixture',
      'FIX-NCM','PAN','FIX-NCM-PAN','Fictional Owner',support_phone,'foreign@local.hastabazaar.test',
      'Madhesh','Parsa','Birgunj','Fictional workshop','approved',created_at,updated_at
    FROM seller_profiles WHERE id='registered';
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','seller',1);
    INSERT INTO seller_operational_addresses(id,seller_id,purpose,province,district,municipality,locality,created_at,updated_at)
    VALUES ('demo-birgunj-pickup','secondary','pickup','','','','Fictional Birgunj workshop',1,1),
      ('demo-pokhara-pickup','registered','pickup','','','','Fictional Pokhara workshop',1,1)
    ON CONFLICT(seller_id,purpose) DO UPDATE SET province='',district='',municipality='',locality=excluded.locality,updated_at=1;
  `);
  const assignDemoBranches = (secondaryOrigin = 'BIRGUNJ') => {
    const pickup = fixture.sqlite.prepare(`SELECT id,seller_id AS sellerId,updated_at AS updatedAt
      FROM seller_operational_addresses WHERE purpose='pickup' AND seller_id IN ('registered','secondary')`).all();
    globalThis.publicCheckoutNcmDemoPickupBranches = JSON.stringify(Object.fromEntries(pickup.map(row => [row.id, {
      branch: row.sellerId === 'registered' ? 'POKHARA' : secondaryOrigin, updatedAt: row.updatedAt,
    }])));
  };
  assignDemoBranches();
  const now = Date.now();
  await readyCheckoutSeller({ database: fixture.db, sqlite: fixture.sqlite }, 'secondary', 'foreign', 'reviewer', now);
  fixture.sqlite.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,
    price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    SELECT 'demo-birgunj-cup','secondary',category_id,'demo-birgunj-cup','DEMO-NCM-CUP',
      'Fictional Birgunj cup','Fictional Birgunj product',20000,4,'Fictional maker','NP','Clay','published',created_at,updated_at
    FROM products WHERE id=?`).run(fixture.productId);
  await addCartItem(fixture.db, fixture.cartHash, 'demo-birgunj-cup', 1, now + 1);
  const cart = await getCart(fixture.db, fixture.cartHash);
  assert.equal(cart.itemSubtotalPaisa, 100_000);
  assert.equal(fixture.serviceFee.chargedPaisa, 0);
  const body = {
    ...fixture.body,
    reviewedQuote: {
      ...fixture.body.reviewedQuote,
      lines: cart.items.map(item => ({
        id: item.id, sellerId: item.sellerId, pricePaisa: item.pricePaisa, quantity: item.quantity,
        ...(item.offerId && {
          offerId: item.offerId, offerVersionId: item.offerVersionId,
          publicVersionId: item.publicVersionId, revision: item.revision,
        }),
      })),
      deliveryPaisa: 38_000, payablePaisa: 138_000, ncmDemoQuotes: reviewedRoutes,
    },
  };
  const quoteRequest = () => new Request('https://public-checkout.test/api/checkout/ncm-demo-quote', {
    method: 'POST', headers: fixture.request().headers, body: JSON.stringify({ district: 'Kathmandu' }),
  });
  return { ...fixture, body, quoteRequest, assignDemoBranches };
}

export function emulateDemoQuotes(readCharge: (branch: string) => string | null) {
  const requested: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://demo.nepalcanmove.com');
    assert.equal(url.pathname, '/api/v1/shipping-rate');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Token ' + demoToken);
    assert.equal(url.searchParams.get('destination'), 'TINKUNE');
    assert.equal(url.searchParams.get('type'), 'Pickup/Collect');
    const branch = url.searchParams.get('creation')!;
    assert.ok(['POKHARA', 'BIRGUNJ'].includes(branch));
    requested.push(branch);
    const charge = readCharge(branch);
    return charge === null ? new Response('Provider failure', { status: 500 }) : Response.json({ charge });
  };
  return requested;
}
