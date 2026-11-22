type LocalSimulationBindings = {
  HASTABAZAAR_RUNTIME_ENV?: string;
  HASTABAZAAR_LOCAL_SKIP_STAFF_MFA?: string;
};

export function isLoopbackHost(host: string) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host) || host === '::1';
}

function isLocalStaging(bindings: LocalSimulationBindings, host: string) {
  return bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging' &&
    process.env.NODE_ENV !== 'production' && isLoopbackHost(host);
}

export function isLocalSimulation(bindings: LocalSimulationBindings, host: string, email: string) {
  return isLocalStaging(bindings, host) && /@local\.hastabazaar\.test$/i.test(email);
}

export function localStaffMfaFlagEnabled(bindings: LocalSimulationBindings, host: string) {
  return bindings.HASTABAZAAR_LOCAL_SKIP_STAFF_MFA === '1' && isLocalStaging(bindings, host);
}

export function skipsLocalTestStaffMfa(
  bindings: LocalSimulationBindings,
  host: string,
  account: { authSubject: string; email: string; role: string },
) {
  return bindings.HASTABAZAAR_LOCAL_SKIP_STAFF_MFA === '1' &&
    account.authSubject === 'local-test-super-admin' && account.role === 'super_admin' &&
    isLocalSimulation(bindings, host, account.email);
}
