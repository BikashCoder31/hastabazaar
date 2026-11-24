export async function guardedStagingSwitch(operations, signal) {
  signal.throwIfAborted();
  await operations.activate();
  try {
    signal.throwIfAborted();
    await operations.verify();
    signal.throwIfAborted();
  } catch (error) {
    // Rollback has its own allowance; an expired deployment must not cancel it.
    await operations.rollback();
    throw error;
  }
}

/**
 * @param {(entry: { event: 'staging_phase', phase: string, elapsedMs: number, outcome: 'success' | 'failure' }) => void} write
 * @param {() => number} [clock]
 */
export function createStagingPhaseTimer(write, clock = () => performance.now()) {
  /**
   * @template T
   * @param {string} phase
   * @param {() => Promise<T>} operation
   */
  return async function timePhase(phase, operation) {
    const started = clock();
    let succeeded = false;
    try {
      const result = await operation();
      succeeded = true;
      return result;
    } finally {
      try {
        write({ event: 'staging_phase', phase, elapsedMs: Math.round(clock() - started),
          outcome: succeeded ? 'success' : 'failure' });
      } catch { /* Timing output must never change acceptance or rollback. */ }
    }
  };
}
