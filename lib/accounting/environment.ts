/** Safe display label only; never include connection details or credentials. */
export function accountingEnvironment(bindings: {
  HASTABAZAAR_RUNTIME_ENV?: string;
  APP_ORIGIN?: string;
}) {
  if (bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging')
    return 'Local staging · simulated records';
  if (bindings.APP_ORIGIN === 'https://staging.hastabazaar.com')
    return 'Staging · recorded operational data';
  return 'Hosted · recorded operational data';
}
