import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalManifest = fileURLToPath(new URL('../deployment/babal/release-manifest.json', import.meta.url));

/**
 * Resolve the application's static readiness imports to the build-owned snapshot.
 * The historical repository JSON stays untouched; local preview never installs
 * this plugin. The build wrapper supplies the path only to its compiler child.
 * @param {string | undefined} selectedManifest
 * @returns {import('vite').Plugin}
 */
export function buildReleaseManifestPlugin(selectedManifest) {
  if (!selectedManifest) throw new Error('Hosted builds require the selected manifest snapshot from build-babal.mjs.');
  const replacement = resolve(selectedManifest).replaceAll('\\', '/');
  return {
    name: 'hastabazaar-build-release-manifest',
    enforce: 'pre',
    resolveId(source, importer) {
      const path = source.split('?', 1)[0];
      if (!isAbsolute(path) && (!path.startsWith('.') || !importer)) return null;
      const resolved = resolve(importer ? dirname(importer.split('?', 1)[0]) : process.cwd(), path);
      return resolved === canonicalManifest ? replacement : null;
    },
  };
}
