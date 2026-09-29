import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type HeaderOrdersLinkProps = {
  authenticated: boolean;
};

void test('header Orders link is visible only to authenticated customers', async () => {
  const compiled = await build({
    entryPoints: ['components/layout/site-header.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'site-header-test-stubs',
        setup(bundle) {
          bundle.onResolve({filter:/^cloudflare:workers$/},()=>({path:'workers',namespace:'header-workers'}));
          bundle.onLoad({filter:/^workers$/,namespace:'header-workers'},()=>({contents:'export const env={};',loader:'js'}));
          bundle.onResolve(
            {
              filter:
                /^(next\/(image|link)|@\/app\/auth|@\/components\/layout\/(brand-wordmark|mobile-navigation|rewards-shortcut)|@\/components\/ui\/input|@\/lib\/catalog\/storefront-navigation)$/,
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
                    "const React=require('react');module.exports=function Image(props){return React.createElement('img',props);};",
                  loader: 'js',
                };
              }
              if (path === '@/app/auth') {
                return {
                  contents:
                    "exports.getAuthenticatedUser=async()=>null;exports.signInPath=(path)=>'/login?return_to='+encodeURIComponent(path);",
                  loader: 'js',
                };
              }
              if (path === '@/lib/catalog/storefront-navigation') {
                return {
                  contents: 'exports.storefrontNavigation=[];',
                  loader: 'js',
                };
              }
              return {
                contents:
                  "const React=require('react');module.exports=new Proxy({},{get:()=>function Stub(){return React.createElement('span');}});",
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
      HeaderOrdersLink?: ComponentType<HeaderOrdersLinkProps>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
  });
  const HeaderOrdersLink = renderedModule.exports.HeaderOrdersLink;

  assert.equal(
    typeof HeaderOrdersLink,
    'function',
    'SiteHeader must expose its authentication-aware Orders link',
  );
  if (!HeaderOrdersLink) return;

  const signedOutHtml = renderToStaticMarkup(
    createElement(HeaderOrdersLink, { authenticated: false }),
  );
  assert.doesNotMatch(signedOutHtml, /href="\/account\/orders"/);
  assert.doesNotMatch(signedOutHtml, />Orders</);

  const signedInHtml = renderToStaticMarkup(
    createElement(HeaderOrdersLink, { authenticated: true }),
  );
  assert.match(signedInHtml, /href="\/account\/orders"/);
  assert.match(signedInHtml, />Orders</);
});
