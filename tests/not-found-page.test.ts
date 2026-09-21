import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

void test('custom 404 provides privacy-safe recovery navigation', async () => {
  const compiled = await build({
    entryPoints: ['app/not-found.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'not-found-test-stubs',
        setup(bundle) {
          bundle.onResolve(
            {
              filter:
                /^(next\/(image|link)|@\/components\/layout\/(site-header|site-footer))$/,
            },
            ({ path }) => ({ path, namespace: 'test-stub' }),
          );
          bundle.onLoad(
            { filter: /.*/, namespace: 'test-stub' },
            ({ path }) => {
              if (path === 'next/link') {
                return {
                  contents:
                    "const React=require('react');module.exports=function Link(props){return React.createElement('a',props);};",
                  loader: 'js',
                };
              }
              if (path === 'next/image') {
                return {
                  contents:
                    "const React=require('react');module.exports=function Image({fill,priority,...props}){return React.createElement('img',props);};",
                  loader: 'js',
                };
              }
              return {
                contents:
                  "const React=require('react');module.exports=new Proxy({},{get:()=>function LayoutStub(){return React.createElement('div');}});",
                loader: 'js',
              };
            },
          );
        },
      },
    ],
  });
  const renderedModule = {
    exports: {} as {
      NotFoundContent?: ComponentType;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
  });

  const NotFoundContent = renderedModule.exports.NotFoundContent;
  assert.equal(
    typeof NotFoundContent,
    'function',
    'The 404 recovery content must be independently renderable',
  );
  if (!NotFoundContent) return;

  const html = renderToStaticMarkup(createElement(NotFoundContent));

  assert.match(html, /<main[^>]*id="main-content"/);
  assert.match(html, />404</);
  assert.match(html, /This page has wandered away\./);
  assert.match(
    html,
    /The page you’re looking for may have moved, or the link may no longer be available\./,
  );
  assert.match(html, /href="\/"[^>]*>[^<]*Back to home/);
  assert.match(html, /href="\/shop"[^>]*>[^<]*Explore the collection/);
  assert.doesNotMatch(html, /sign in|owns this order/i);
});
