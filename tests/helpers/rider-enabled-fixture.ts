import { registerHooks } from 'node:module';

// Retain the existing active-program authorization and domain regression tests.
// The production hold is covered separately in rider-portal-hold.test.ts.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === '@/lib/riders/availability' ||
      specifier === '../riders/availability'
    )
      return {
        url: 'data:text/javascript,export function isRiderPortalEnabled(){return true}',
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
