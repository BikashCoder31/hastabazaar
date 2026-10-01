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
