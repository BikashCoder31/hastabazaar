import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

/** Applies every real migration, retaining legacy checks and triggers. No table substitutes. */
export async function createIncentiveDb(
  options: {
    beforePromo?: (db: D1Database) => Promise<void>;
    beforeLoyalty?: (db: D1Database) => Promise<void>;
  } = {},
): Promise<{ db: D1Database; dispose(): Promise<void> }> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: { DB: randomUUID() },
    }),
  );
  try {
    const db = (await mf.getD1Database('DB')) as unknown as D1Database;
    const names = (await readdir(new URL('../../drizzle/', import.meta.url)))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    for (const name of names) {
      if (name.startsWith('0060_')) await options.beforePromo?.(db);
      if (name.startsWith('0061_')) await options.beforeLoyalty?.(db);
      const sql = await readFile(
        new URL(`../../drizzle/${name}`, import.meta.url),
        'utf8',
      );
      for (const statement of sql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        // D1 rejects an empty prepared statement; standalone migration comments carry no SQL.
        .filter((statement) => statement.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith('--')))) {
        try {
          await db.prepare(statement).run();
        } catch (error) {
          throw new Error(
            `Migration ${name} failed: ${statement.slice(0, 100)}`,
            { cause: error },
          );
        }
      }
    }
    // Allows the same preservation assertions to fail on behavior before 0060 exists.
    if (!names.some((name) => name.startsWith('0060_')))
      await options.beforePromo?.(db);
    if (!names.some((name) => name.startsWith('0061_')))
      await options.beforeLoyalty?.(db);
    return { db, dispose: () => mf.dispose() };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

export async function seedIncentiveCustomer(db: D1Database, id = 'customer') {
  await db
    .prepare(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
    VALUES (?,?,?,'Fictional customer','en-NP','active',1,1)`)
    .bind(id, id, `${id}@example.test`)
    .run();
  await db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',1)",
    )
    .bind(id)
    .run();
  await db
    .prepare(
      'INSERT INTO wallet_accounts(user_id,referral_code,created_at) VALUES (?,?,1)',
    )
    .bind(id, `REF-${id}`)
    .run();
}

export function incentiveOrder(
  db: D1Database,
  id: string,
  referral = 0,
  wallet = 0,
) {
  return db
    .prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,
    policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,
    payment_mode,payment_status,created_at,updated_at,referral_discount_paisa,wallet_credit_paisa)
    VALUES (?,?,'customer','customer@example.test','9811111111','placed','en-NP','fixture','{}',10000,500,?,
    'cod','unpaid',1,1,?,?)`)
    .bind(id, `FIX-${id}`, 10500 - referral - wallet, referral, wallet);
}

export async function seedIncentiveInventory(db: D1Database) {
  // Real seller/category/product parents keep inventory and seller-eligibility triggers active.
  await db
    .prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,
    registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,
    province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
    VALUES ('seller','customer','Fictional Maker','Fixture Shop','Local','FIX-REG','PAN','FIX-PAN','Maker',
    '9800000000','seller@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','FIX-BANK','approved',1,1)`)
    .run();
  await db
    .prepare(
      "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('category','fixture-category','Fixture',1,1,1,1)",
    )
    .run();
  await db
    .prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,
    inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('product','seller','category','fixture-product','FIX-SKU','Fixture product','Fictional',10000,100,
    'Maker','NP','Fibre',1,'published',1,1)`)
    .run();
}
export function incentiveItem(
  db: D1Database,
  id: string,
  orderId: string,
  promo = 0,
  referral = 0,
) {
  return db
    .prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,
    sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at,
    platform_discount_paisa,promo_discount_paisa,referral_discount_paisa)
    VALUES (?,?,'product','seller','Fixture Shop','Fixture product','FIX-SKU',10000,1,900,900,10000,1,?,?,?)`)
    .bind(id, orderId, promo + referral, promo, referral);
}
