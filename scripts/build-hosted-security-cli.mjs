import { build } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Self-contained operator artifact: no source tree, TypeScript loader or package install on the host. */
export async function buildHostedSecurityCli(standalone) {
  await build({
    entryPoints: [fileURLToPath(new URL('./deployment/provision-hosted-security.mts', import.meta.url))],
    outfile: join(standalone, 'hosted-security.mjs'),
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: false,
    // Bundled CommonJS dependencies use require only for Node builtins (and an
    // optional debug highlighter). Include mysql2 in the artifact itself.
    banner: { js: "import { createRequire as operatorCreateRequire } from 'node:module'; const require = operatorCreateRequire(import.meta.url);" },
  });
}
