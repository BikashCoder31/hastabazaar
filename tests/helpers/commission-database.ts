import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { SELLER_AGREEMENT_VERSION } from '../../lib/content/legal-policies';
import { historicalCommissionFixture } from './historical-commission-fixture';

export async function commissionDatabase(options:{seedSellers?:boolean}={}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite?.exec('PRAGMA foreign_keys = ON');
  if (sqlite)
    for (const name of (
      await readdir(new URL('../../drizzle/', import.meta.url))
    )
      .filter((n) => /^\d{4}_.+\.sql$/.test(n))
      .sort()) {
      sqlite.exec(
        await readFile(
          new URL(`../../drizzle/${name}`, import.meta.url),
          'utf8',
        ),
      );
    }
  const database =
    ({
      prepare(sql: string) {
        const statement = sqlite!.prepare(sql);
        let values: SQLInputValue[] = [];
        return {
          bind(...bindings: SQLInputValue[]) {
            values = bindings;
            return this;
          },
          async first<T>() {
            return (statement.get(...values) as T | undefined) ?? null;
          },
          async all<T>() {
            return {
              success: true,
              results: statement.all(...values) as T[],
              meta: {},
            };
          },
          async run() {
            return {
              success: true,
              results: [],
              meta: { changes: Number(statement.run(...values).changes) },
            };
          },
        };
      },
      async batch(statements: { run(): Promise<unknown> }[]) {
        sqlite!.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements)
            results.push(await statement.run());
          sqlite!.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite!.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as D1Database);
  try {
    for (const [id, role] of [
      ['owner', 'super_admin'],
      ['staff', 'admin'],
      ['user-a', 'seller'],
      ['user-b', 'seller'],
    ]) {
      await database
        .prepare(
          "INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',1,1)",
        )
        .bind(id, id, `${id}@example.test`, id)
        .run();
      await database
        .prepare(
          'INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)',
        )
        .bind(id, role)
        .run();
    }
    for (const suffix of options.seedSellers===false?[]:['a', 'b']) {
      await database
        .prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,seller_agreement_version,seller_agreement_accepted_at,created_at,updated_at)
      VALUES (?,?,'Maker',?,'Local',?,'PAN',?,'Maker','9800000000',?,'Bagmati','Kathmandu','Kathmandu','Ward 1',?,'approved',?,1,1,1)`)
        .bind(
          `seller-${suffix}`,
          `user-${suffix}`,
          `Shop ${suffix}`,
          `REG-${suffix}`,
          `PAN-${suffix}`,
          `${suffix}@example.test`,
          `BANK-${suffix}`,
          SELLER_AGREEMENT_VERSION,
        )
        .run();
    }
    return {
      database,
      sqlite,
      dispose: async () => {
        sqlite.close();
      },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

/** Opt in only for tests whose scenario includes a configured historical rate. */
export async function historicalCommissionDatabase(acceptExistingSellers = false) {
  const fixture = await commissionDatabase();
  historicalCommissionFixture(fixture.sqlite,'owner',acceptExistingSellers);
  return fixture;
}
