export const SIMULATED_RECORD_LABEL =
  'SIMULATED — NOT VALID FOR PRODUCTION' as const;

export type RuntimeEnvironmentKind =
  | 'production'
  | 'development'
  | 'local_staging'
  | 'test';

export type RuntimeEnvironmentInput = Readonly<{
  runtimeEnvironment?: string;
  nodeEnvironment?: string;
  appOrigin?: string;
}>;

export type RuntimeEnvironment = Readonly<{
  kind: RuntimeEnvironmentKind;
  simulationAllowed: boolean;
  recordLabel: typeof SIMULATED_RECORD_LABEL | null;
}>;

const supportedRuntimeEnvironments = new Set<RuntimeEnvironmentKind>([
  'production',
  'development',
  'local_staging',
  'test',
]);

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isOfficialProductionOrigin(origin: URL | null): boolean {
  if (!origin) return false;
  const hostname = origin.hostname.toLowerCase();
  return hostname === 'hastabazaar.com' || hostname.endsWith('.hastabazaar.com');
}

function isLoopbackOrigin(origin: URL | null): boolean {
  if (!origin || origin.username || origin.password) return false;
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return false;
  const hostname = origin.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function resolveRuntimeEnvironment(
  input: RuntimeEnvironmentInput,
): RuntimeEnvironment {
  const requested = input.runtimeEnvironment?.trim();
  const kind = (requested || 'production') as RuntimeEnvironmentKind;
  if (!supportedRuntimeEnvironments.has(kind)) {
    throw new Error(`Unknown runtime environment: ${requested}.`);
  }

  const origin = parseOrigin(input.appOrigin);
  if (
    (kind === 'local_staging' || kind === 'test') &&
    isOfficialProductionOrigin(origin)
  ) {
    throw new Error(
      'A simulation environment cannot use an official production origin.',
    );
  }
  if (kind === 'local_staging' && !isLoopbackOrigin(origin)) {
    throw new Error('Local staging origin must be an explicit loopback HTTP(S) URL.');
  }
  if (kind === 'test' && input.nodeEnvironment === 'production') {
    throw new Error('The test environment is unavailable in a production Node runtime.');
  }

  const simulationAllowed = kind === 'local_staging' || kind === 'test';
  return Object.freeze({
    kind,
    simulationAllowed,
    recordLabel: simulationAllowed ? SIMULATED_RECORD_LABEL : null,
  });
}

export function assertSimulationAllowed(environment: RuntimeEnvironment): void {
  if (!environment.simulationAllowed || environment.kind === 'production') {
    throw new Error('Simulated records are forbidden in the production environment.');
  }
  if (environment.recordLabel !== SIMULATED_RECORD_LABEL) {
    throw new Error('Simulated records require the immutable simulation label.');
  }
}
