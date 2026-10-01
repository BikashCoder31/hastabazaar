import { writeFile } from 'node:fs/promises';
const table = `CREATE TABLE IF NOT EXISTS order_email_jobs (
 id VARCHAR(191) PRIMARY KEY,
 order_id VARCHAR(191) NOT NULL REFERENCES orders(id),
 order_status VARCHAR(32) NOT NULL,
 created_at BIGINT NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'queued',
 attempts BIGINT NOT NULL DEFAULT 0,
 next_attempt_at BIGINT NOT NULL DEFAULT 0,
 lease_until BIGINT NOT NULL DEFAULT 0,
 claim_token VARCHAR(64),
 sent_at BIGINT,
 failure_code VARCHAR(64)
)`;
const index =
  'CREATE INDEX IF NOT EXISTS idx_order_email_due ON order_email_jobs(status,next_attempt_at,lease_until)';
const statuses =
  "('confirmed','packing','ready_for_pickup','dispatched','delivered','cancelled')";
const unique = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_order_email_event ON order_email_jobs(order_id,order_status)';
const sqlite = [table + ';', unique + ';', index + ';'];
const maria = [
  table + ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  unique + ';',
  index + ';',
];
for (const event of ['INSERT', 'UPDATE']) {
  const name = `queue_order_email_${event.toLowerCase()}`;
  const when =
    `NEW.status IN ${statuses}` +
    (event === 'UPDATE' ? ' AND OLD.status <> NEW.status' : '');
  const columns = 'id,order_id,order_status,created_at';
  const values = "NEW.id || ':' || NEW.status,NEW.id,NEW.status,NEW.updated_at";
  sqlite.push(`CREATE TRIGGER ${name} AFTER ${event} ON orders FOR EACH ROW WHEN ${when} BEGIN
 INSERT OR IGNORE INTO order_email_jobs(${columns}) VALUES (${values}); END;`);
  maria.push(`DROP TRIGGER IF EXISTS ${name};\nDELIMITER $$\nCREATE TRIGGER ${name} AFTER ${event} ON orders FOR EACH ROW BEGIN
 IF ${when} THEN INSERT IGNORE INTO order_email_jobs(${columns}) VALUES (CONCAT(NEW.id,':',NEW.status),NEW.id,NEW.status,NEW.updated_at); END IF;
 END$$\nDELIMITER ;`);
}
await writeFile(
  'drizzle/0022_order_updates.sql',
  sqlite.join('\n--> statement-breakpoint\n') + '\n',
);
await writeFile(
  'deployment/babal/mariadb-order-updates.sql',
  '-- Additive migration; no historic order emails are backfilled.\n' +
    maria.join('\n\n') +
    '\n',
);
