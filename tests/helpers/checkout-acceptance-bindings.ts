import assert from 'node:assert/strict';

/** Supply fictional original consent to the checkout batch before it is saved. */
export function withCheckoutAcceptanceTerms(
  database: D1Database,
  transform: (snapshot: Record<string, unknown>) => Record<string, unknown>,
): D1Database {
  return new Proxy(database, {
    get(target, key) {
      if (key === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!/^\s*INSERT INTO order_policy_acceptances\s*\(/i.test(sql))
            return statement;
          return new Proxy(statement, {
            get(prepared, property) {
              if (property === 'bind') {
                return (...values: unknown[]) => {
                  const terms = values[3];
                  assert.ok(typeof terms === 'string');
                  values[3] = JSON.stringify(transform(JSON.parse(terms)));
                  return prepared.bind(...values);
                };
              }
              const value = Reflect.get(prepared, property);
              return typeof value === 'function' ? value.bind(prepared) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
