import type { PluginBuild } from 'esbuild';

/** Preserve anchor semantics in isolated component fixtures without requiring the Vinext resolver. */
export function stubFixtureLink(bundler: PluginBuild): void {
  bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture-link' }));
  bundler.onLoad({ filter: /^link$/, namespace: 'fixture-link' }, () => ({
    resolveDir: process.cwd(), loader: 'tsx',
    contents: "import React from 'react'; export default function Link({children,...props}) { return <a {...props}>{children}</a>; }",
  }));
}

/** Render a plain image in component fixtures that do not run the Next image loader. */
export function stubFixtureImage(bundler: PluginBuild): void {
  bundler.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'fixture-image' }));
  bundler.onLoad({ filter: /^image$/, namespace: 'fixture-image' }, () => ({
    resolveDir: process.cwd(), loader: 'tsx',
    contents: "import React from 'react'; export default function Image({fill,unoptimized,priority,...props}) { return <img {...props}/>; }",
  }));
}
