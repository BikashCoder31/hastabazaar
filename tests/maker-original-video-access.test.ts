import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';

void test('reviewed maker media retains original video access and its caption while video development is deferred', async () => {
  const modules: Record<string, string> = {
    'cloudflare:workers': 'export const env={};',
    '@/lib/db/d1': 'export function requireDatabase(){return {}}',
    '@/components/layout/site-header': 'export const SiteHeader=()=>null;',
    '@/components/layout/site-footer': 'export const SiteFooter=()=>null;',
    'next/navigation': 'export function notFound(){throw Error("Unexpected missing fictional maker")}',
    'next/link': 'import React from "react";export default function Link({children,...props}){return React.createElement("a",props,children)}',
    'next/image': 'import React from "react";export default function Image({unoptimized,...props}){return React.createElement("img",props)}',
    '@/lib/db/repositories/customers': 'export async function getPublicMakerProfile(){return {tradingName:"Fictional maker",participationRoute:"registered_seller",businessDescription:"Fictional retained profile",municipality:"Fictional town"}};export async function listPublishedProductsByMaker(){return []}',
    '@/lib/sellers/public-profile-media': 'export async function getReviewedPublicProfileExtras(){return {languages:[],craftExperience:[],socialLinks:{},media:[{id:"retained-workshop-video",kind:"workshop_video",caption:"Recorded workshop tour"}]}}',
  };
  const compiled = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: 'import Page from "./app/makers/[id]/page";import {renderToStaticMarkup} from "react-dom/server";export async function render(){return renderToStaticMarkup(await Page({params:Promise.resolve({id:"fictional-maker"})}))}' },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'reviewed-presentation-only', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => modules[args.path] ? { path: args.path, namespace: 'reviewed-fixture' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'reviewed-fixture' }, args => ({ contents: modules[args.path], loader: 'tsx', resolveDir: process.cwd() }));
    } }],
  });
  const loaded = { exports: {} as { render: () => Promise<string> } };
  compileFunction(compiled.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url), loaded, loaded.exports);
  const html = await loaded.exports.render();
  assert.match(html, /Fictional maker/);
  assert.match(html, /Recorded workshop tour/);
  assert.match(html, /href="\/api\/profile-media\/retained-workshop-video"/);
  assert.match(html, /View original maker video/);
  assert.doesNotMatch(html, /<video|<track/);
});
