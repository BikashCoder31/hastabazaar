import assert from 'node:assert/strict';

export function stagingNativeMode(args) {
  assert.ok(args.length === 0 || args.length === 1 && ['--local-recovery','--historical-only'].includes(args[0]),
    'Only one of --local-recovery or --historical-only is permitted');
  return { localRecovery:args[0] === '--local-recovery', historicalOnly:args[0] === '--historical-only' };
}
