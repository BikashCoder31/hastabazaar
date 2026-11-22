import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import vinext from 'vinext';
import { defineConfig, loadEnv } from 'vite';
import { localPreviewBindings } from './lib/staging/local-preview-bindings';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };
import {localSecurityPolicyPlugin} from './lib/staging/security-policy-plugin';
import { buildReleaseManifestPlugin } from './scripts/build-release-manifest-plugin.mjs';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

const hostedLocalTestStub = `
export const localTestRoles = ['customer', 'seller', 'admin', 'super_admin'];
export const localTestCookieName = 'hastabazaar_local_test_role';
export function isLocalTestRequest() { return false; }
export function readLocalTestRole() { return null; }
export function getLocalTestIdentity() { return null; }
export function localTestIdentity() {
  throw new Error('Local test identities are not included in hosted builds.');
}
export async function ensureLocalTestAccount() {
  throw new Error('Local test accounts are disabled in hosted builds.');
}
`;

function disableHostedLocalTesting() {
  return {
    name: 'hastabazaar-disable-hosted-local-testing',
    enforce: 'pre' as const,
    load(id: string) {
      const sourcePath = id.split('?', 1)[0].replaceAll('\\\\', '/');
      if (
        sourcePath.endsWith('/lib/auth/local-test-access.ts') ||
        sourcePath.endsWith('/lib/auth/local-test-seed.ts')
      ) {
        return hostedLocalTestStub;
      }
      return null;
    },
  };
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: 'drizzle',
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command, mode }) => {
  const previewEnvironment = command === 'serve' && process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
    ? { ...process.env, ...loadEnv(mode, process.cwd(), 'HASTABAZAAR_LOCAL_SKIP_STAFF_MFA') }
    : process.env;
  const localDecoderOptIn = process.env.HASTABAZAAR_LOCAL_RIDER_DECODER;
  if (localDecoderOptIn && (command !== 'serve' || process.env.NODE_ENV === 'production' || process.env.DEPLOY_TARGET))
    throw new Error('The local rider decoder is forbidden in builds and hosted runtimes.');
  const localDecoder = localDecoderOptIn
    ? await (await import('./scripts/staging/rider-media-plugin')).localRiderMediaPlugin(process.env, process.cwd())
    : null;
  const localProductMedia = !localDecoder && command === 'serve' && process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
    ? await (await import('./scripts/staging/product-watermark-plugin')).localProductMediaPlugin(process.env, process.cwd(), command)
    : null;
  const isBabalBuild = process.env.DEPLOY_TARGET === 'babal';
  if (isBabalBuild) {
    return {
      css: { postcss: { plugins: [tailwindcss()] } },
      plugins: [buildReleaseManifestPlugin(process.env.HASTABAZAAR_BUILD_RELEASE_MANIFEST), disableHostedLocalTesting(), vinext()],
      resolve: {
        alias: [
          {
            find: 'cloudflare:workers',
            replacement: fileURLToPath(
              new URL('./lib/runtime/node-bindings.ts', import.meta.url),
            ),
          },
        ],
      },
    };
  }

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  const { sites } = await import('@openai/sites-vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: localDecoder ? { host: '127.0.0.1', port: Number(new URL(process.env.APP_ORIGIN!).port || '80'), strictPort: true }
      : command === 'serve' && process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
      ? {
          host: new URL(process.env.APP_ORIGIN!).hostname,
          port: Number(new URL(process.env.APP_ORIGIN!).port || '80'),
          strictPort: true,
          watch: {
            // Local evidence trees contain copied source and must not enter HMR discovery.
            ignored: ['**/.test-artifacts/**', '**/test-artifacts/**', '**/output/**', '**/outputs/**', '**/.superpowers/**'],
            ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}),
          },
        }
      : isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      ...(command === 'serve' && process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging' ? [localSecurityPolicyPlugin()] : []),
      ...(localDecoder ? [localDecoder] : []),
      ...(localProductMedia ? [localProductMedia] : []),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: { ...localBindingConfig, vars: localPreviewBindings(previewEnvironment, command),
          // Secret values are loaded from the checked launcher's process environment,
          // never config.vars/client defines or a built preview .dev.vars asset.
          secrets: { required: command === 'serve' && process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging' ? ['HASTABAZAAR_SECURITY_KEY'] : [] } },
        remoteBindings: false,
        persistState:
          process.env.HASTABAZAAR_RUNTIME_ENV === 'local_staging'
            ? { path: '.staging/state' }
            : { path: '.wrangler/state' },
      }),
    ],
  };
});
