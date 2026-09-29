import { resolveRuntimeEnvironment } from './environment';

// Forward only explicit, non-secret local preview configuration to Worker bindings.
export function localPreviewBindings(environment: Record<string, string | undefined>, command: 'serve' | 'build'): Record<string, string> {
  if (command !== 'serve' || environment.HASTABAZAAR_RUNTIME_ENV !== 'local_staging') return {};
  if (environment.NODE_ENV === 'production' || environment.DEPLOY_TARGET) {
    throw new Error('Local preview bindings are forbidden in hosted runtimes.');
  }
  resolveRuntimeEnvironment({ runtimeEnvironment: 'local_staging', nodeEnvironment: environment.NODE_ENV, appOrigin: environment.APP_ORIGIN });
  return { HASTABAZAAR_RUNTIME_ENV: 'local_staging', APP_ORIGIN: environment.APP_ORIGIN! };
}
