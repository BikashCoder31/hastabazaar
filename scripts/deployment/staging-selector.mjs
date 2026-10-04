import assert from 'node:assert/strict';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function stagingApplication(version) {
  assert.ok(isRecord(version), 'Malformed selector version inventory.');
  if (version.users === undefined) return undefined;
  assert.ok(isRecord(version.users), 'Malformed selector users inventory.');
  if (!Object.hasOwn(version.users, 'hastabaz')) return undefined;
  const user = version.users.hastabaz;
  assert.ok(isRecord(user), 'Malformed staging user inventory.');
  if (user.applications === undefined) return undefined;
  assert.ok(isRecord(user.applications), 'Malformed staging applications inventory.');
  if (!Object.hasOwn(user.applications, 'hastabazaar-staging-app')) return undefined;
  const application = user.applications['hastabazaar-staging-app'];
  assert.ok(isRecord(application), 'Malformed staging application configuration.');
  return application;
}

/** Validate the exact running Node version and approved staging bindings; never choose another application. */
export function assertStagingSelectorConfiguration(selector, nodeVersion, runtime) {
  assert.ok(typeof nodeVersion === 'string' && /^22\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(nodeVersion), 'A numeric Node22 version is required.');
  assert.ok(isRecord(selector) && selector.result === 'success', 'Staging selector query did not succeed.');
  const versions = selector.available_versions;
  assert.ok(isRecord(versions), 'Malformed selector version inventory.');
  assert.ok(Object.hasOwn(versions, nodeVersion), 'Selector lacks the exact running Node version.');
  const applications = new Map();
  for (const [version, inventory] of Object.entries(versions)) {
    const application = stagingApplication(inventory);
    if (application) applications.set(version, application);
  }
  const configuration = applications.get(nodeVersion);
  assert.ok(configuration, 'Selector lacks the exact staging user/application.');
  assert.equal(applications.size, 1, 'Ambiguous staging application across selector versions.');
  assert.ok(configuration.domain === 'staging.hastabazaar.com', 'Staging selector domain differs from the approved domain.');
  assert.ok(configuration.startup_file === 'app.cjs', 'Staging selector startup file differs from the approved file.');
  assert.ok(isRecord(configuration.env_vars) && isRecord(runtime), 'Malformed staging environment bindings.');
  const variables = Object.fromEntries(Object.entries(configuration.env_vars).map(([key, binding]) => {
    const value = typeof binding === 'string' ? binding : isRecord(binding) && Object.hasOwn(binding, 'value') ? binding.value : undefined;
    assert.ok(typeof value === 'string', 'Malformed staging environment binding.');
    return [key, value];
  }));
  assert.ok(Object.keys(variables).length === Object.keys(runtime).length &&
    Object.entries(runtime).every(([key, value]) => typeof value === 'string' && Object.hasOwn(variables, key) && variables[key] === value),
  'Passenger environment differs from approved staging bindings.');
  return configuration;
}
