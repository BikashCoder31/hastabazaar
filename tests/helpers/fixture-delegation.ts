/** Override a fixture boundary while retaining native prototype methods and their receiver. */
export function fixtureWithOverrides<T extends object>(target: T, overrides: Partial<T>): T {
  const delegated = new Proxy(target, {
    get(original, key) {
      if (Object.hasOwn(overrides, key)) return Reflect.get(overrides, key);
      const value: unknown = Reflect.get(original, key, original);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, original, args);
        return result === original ? delegated : result;
      };
    },
  });
  return delegated;
}
