import { writeFile } from 'node:fs/promises';

// Both runtimes use the same constraints and trigger bodies. No existing data is reset.
const tables = [
  `CREATE TABLE IF NOT EXISTS wallet_accounts (
 user_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 referral_code VARCHAR(32) NOT NULL UNIQUE,
 balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK(balance_paisa >= 0),
 created_at BIGINT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS referral_campaign (
 id VARCHAR(32) PRIMARY KEY,
 enabled BIGINT NOT NULL DEFAULT 1,
 friend_discount_paisa BIGINT NOT NULL CHECK(friend_discount_paisa > 0),
 reward_paisa BIGINT NOT NULL CHECK(reward_paisa > 0),
 minimum_subtotal_paisa BIGINT NOT NULL CHECK(minimum_subtotal_paisa > friend_discount_paisa),
 return_window_days BIGINT NOT NULL CHECK(return_window_days >= 7),
 updated_at BIGINT NOT NULL
)`,
  `INSERT INTO referral_campaign (id, enabled, friend_discount_paisa, reward_paisa, minimum_subtotal_paisa, return_window_days, updated_at)
 SELECT 'default', 1, 10000, 10000, 150000, 7, 0 WHERE NOT EXISTS (SELECT 1 FROM referral_campaign WHERE id = 'default')`,
  `CREATE TABLE IF NOT EXISTS referral_redemptions (
 customer_id VARCHAR(191) PRIMARY KEY REFERENCES users(id),
 referrer_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) NOT NULL UNIQUE REFERENCES orders(id),
 phone_key VARCHAR(32) NOT NULL UNIQUE,
 reward_paisa BIGINT NOT NULL CHECK(reward_paisa > 0),
 wait_days BIGINT NOT NULL CHECK(wait_days >= 7),
 created_at BIGINT NOT NULL,
 CHECK(customer_id <> referrer_id)
)`,
  `CREATE TABLE IF NOT EXISTS wallet_entries (
 id VARCHAR(191) PRIMARY KEY,
 user_id VARCHAR(191) NOT NULL REFERENCES wallet_accounts(user_id),
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 amount_paisa BIGINT NOT NULL CHECK(amount_paisa <> 0),
 platform_amount_paisa BIGINT NOT NULL,
 kind VARCHAR(32) NOT NULL CHECK(kind IN ('referral_reward','order_spend','cancellation','refund')),
 created_at BIGINT NOT NULL,
 CHECK(amount_paisa + platform_amount_paisa = 0),
 CHECK((kind = 'order_spend' AND amount_paisa < 0) OR (kind <> 'order_spend' AND amount_paisa > 0))
)`,
];
const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id,created_at)',
  'CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referral_redemptions(referrer_id,created_at)',
];
const alters = [
  'ALTER TABLE orders ADD COLUMN wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0)',
  'ALTER TABLE orders ADD COLUMN referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0)',
  'ALTER TABLE refunds ADD COLUMN wallet_credit_paisa BIGINT NOT NULL DEFAULT 0 CHECK(wallet_credit_paisa >= 0)',
  'ALTER TABLE refunds ADD COLUMN referral_discount_paisa BIGINT NOT NULL DEFAULT 0 CHECK(referral_discount_paisa >= 0)',
  'ALTER TABLE refunds ADD COLUMN credit_base_paisa BIGINT NOT NULL DEFAULT 0',
];
const triggers = [
  {
    name: 'wallet_refund_lock',
    timing: 'BEFORE INSERT',
    table: 'refunds',
    body: 'UPDATE orders SET updated_at=updated_at WHERE id=NEW.order_id;',
  },
  {
    name: 'wallet_refund_guard',
    timing: 'BEFORE INSERT',
    table: 'refunds',
    when: `EXISTS (SELECT 1 FROM orders o WHERE o.id=NEW.order_id AND o.wallet_credit_paisa + o.referral_discount_paisa > 0) AND
   (NEW.credit_base_paisa <> (SELECT COALESCE(SUM(item_amount_paisa),0) FROM refunds WHERE order_id=NEW.order_id AND status <> 'rejected')
    OR NEW.wallet_credit_paisa + NEW.referral_discount_paisa > NEW.item_amount_paisa)`,
    error: 'wallet_refund_changed_retry',
  },
  {
    name: 'wallet_entry_balance',
    timing: 'AFTER INSERT',
    table: 'wallet_entries',
    body: `UPDATE wallet_accounts SET balance_paisa = balance_paisa + NEW.amount_paisa WHERE user_id = NEW.user_id;`,
  },
  {
    name: 'wallet_entry_no_update',
    timing: 'BEFORE UPDATE',
    table: 'wallet_entries',
    error: 'wallet_entries_immutable',
  },
  {
    name: 'wallet_entry_no_delete',
    timing: 'BEFORE DELETE',
    table: 'wallet_entries',
    error: 'wallet_entries_immutable',
  },
  {
    name: 'wallet_cancel_restore',
    timing: 'AFTER UPDATE',
    table: 'orders',
    when: "NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.wallet_credit_paisa > 0",
    body: `INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 VALUES (CONCAT('cancel:',NEW.id),NEW.customer_id,NEW.id,NEW.wallet_credit_paisa,-NEW.wallet_credit_paisa,'cancellation',NEW.updated_at);`,
  },
  {
    name: 'wallet_refund_restore',
    timing: 'AFTER UPDATE',
    table: 'refunds',
    when: "NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.wallet_credit_paisa > 0",
    body: `INSERT INTO wallet_entries (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at)
 SELECT CONCAT('refund:',NEW.id), customer_id, id, NEW.wallet_credit_paisa, -NEW.wallet_credit_paisa, 'refund', NEW.processed_at FROM orders WHERE id = NEW.order_id;`,
  },
  {
    name: 'referral_first_order',
    timing: 'BEFORE INSERT',
    table: 'referral_redemptions',
    when: `EXISTS (SELECT 1 FROM orders WHERE (customer_id = NEW.customer_id OR (CASE WHEN LENGTH(REPLACE(customer_phone,'+','')) > 10 THEN SUBSTR(REPLACE(customer_phone,'+',''),4) ELSE REPLACE(customer_phone,'+','') END) = NEW.phone_key) AND id <> NEW.order_id AND status <> 'cancelled')`,
    error: 'referral_first_order_only',
  },
];
const sqlite = [...tables, ...indexes, ...alters].map((s) => s + ';');
const maria = [
  ...tables.map((s) =>
    s.startsWith('CREATE TABLE')
      ? s.replace(
          /\n\)/g,
          '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        )
      : s,
  ),
  ...indexes,
  ...alters.map((s) => s.replace('ADD COLUMN ', 'ADD COLUMN IF NOT EXISTS ')),
].map((s) => s + ';');
for (const t of triggers) {
  const body = t.error
    ? `SELECT RAISE(ABORT, '${t.error}');`
    : t.body.replace(/CONCAT\('([^']+)',NEW.id\)/g, "'$1' || NEW.id");
  sqlite.push(
    `CREATE TRIGGER ${t.name} ${t.timing} ON ${t.table} FOR EACH ROW ${t.when ? 'WHEN ' + t.when : ''} BEGIN ${body} END;`,
  );
  const mb = t.error
    ? `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${t.error}';`
    : t.body;
  maria.push(
    `DROP TRIGGER IF EXISTS ${t.name};\nDELIMITER $$\nCREATE TRIGGER ${t.name} ${t.timing} ON ${t.table} FOR EACH ROW BEGIN\n${t.when ? 'IF ' + t.when + ' THEN\n' : ''}${mb}\n${t.when ? 'END IF;\n' : ''}END$$\nDELIMITER ;`,
  );
}
maria.push(`-- Match SQLite checkout inventory reservation in the MariaDB deployment.
DROP TRIGGER IF EXISTS order_items_require_available_inventory;
DROP TRIGGER IF EXISTS order_items_reserve_inventory;
DELIMITER $$
CREATE TRIGGER order_items_require_available_inventory BEFORE INSERT ON order_items FOR EACH ROW BEGIN
 IF NEW.product_id IS NOT NULL THEN
  UPDATE products SET inventory_quantity=inventory_quantity-NEW.quantity
   WHERE id=NEW.product_id AND status='published' AND inventory_quantity>=NEW.quantity;
  IF ROW_COUNT() <> 1 THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='product_unavailable';
  END IF;
 END IF;
END$$
DELIMITER ;`);
await writeFile(
  'drizzle/0021_referrals_wallet.sql',
  sqlite.join('\n--> statement-breakpoint\n') + '\n',
);
await writeFile(
  'deployment/babal/mariadb-referrals-wallet.sql',
  '-- Additive referral and store-credit migration. Back up before applying.\n' +
    maria.join('\n\n') +
    '\n',
);
