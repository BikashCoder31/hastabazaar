import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

void test('actual promo server page quotes the current waiver and forwards campaign with unchanged standard rate', async () => {
  const campaign = {
    id: 'fixture',
    revision: 2,
    state: 'published',
    name: 'Server launch',
    description: 'Fixture',
    startsAt: 1,
    endsAt: 253402300799999,
  };
  const calls: number[] = [];
  const bundle = await build({
    entryPoints: ['app/admin/promo-codes/page.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*'],
    plugins: [
      {
        name: 'page-fixture',
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(cloudflare:workers|next\/navigation|@\/lib\/auth\/staff|@\/lib\/db\/d1|@\/lib\/db\/repositories\/(promo-codes|incentive-reporting|commission-rates|fee-waivers)|@\/components\/admin\/(promo-code-manager|incentive-reports))$/,
            },
            (args) => ({ path: args.path, namespace: 'fixture' }),
          );
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
            const path = args.path;
            const contents =
              path === 'cloudflare:workers'
                ? 'export const env={DB:{fixture:true}}'
                : path === 'next/navigation'
                  ? 'export function redirect(){throw Error("Denied")}'
                  : path.endsWith('/staff')
                    ? 'export async function requireStaffPage(){return {id:"owner",authSubject:"owner",role:"super_admin"}}'
                    : path.endsWith('/d1')
                      ? 'export const requireDatabase=e=>e.DB'
                      : path.endsWith('/promo-codes')
                        ? 'export async function listPromoCampaigns(){return {campaigns:[],nextCursor:null}}'
                        : path.endsWith('/incentive-reporting')
                          ? 'export async function getPromoAdminReport(){return {}}'
                          : path.endsWith('/commission-rates')
                            ? 'export async function getCommissionRateState(){return {current:{basisPoints:1000}}}'
                            : path.endsWith('/fee-waivers')
                              ? 'export async function quoteFeeWaiver(db,at){if(!db.fixture)throw Error("Wrong DB");globalThis.quoteCalls.push(at);return {campaign:globalThis.campaign}}'
                              : path.endsWith('/promo-code-manager')
                                ? 'export function PromoCodeManager(){}'
                                : 'export function IncentivePageNav(){};export function PromoReportOverview(){};export function PromoActivityReport(){};export function IncentiveHistoryReport(){}';
            return { loader: 'js', contents };
          });
        },
      },
    ],
  });
  const result = { exports: {} as { default: () => Promise<unknown> } };
  runInNewContext(bundle.outputFiles[0].text, {
    module: result,
    exports: result.exports,
    require: createRequire(import.meta.url),
    process,
    campaign,
    quoteCalls: calls,
  });
  const tree = await result.exports.default();
  const props: Record<string, unknown>[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const element = node as { props?: Record<string, unknown> };
    if (element.props) {
      props.push(element.props);
      const children = element.props.children;
      if (Array.isArray(children)) children.forEach(visit);
      else visit(children);
    }
  }
  visit(tree);
  assert.equal(calls.length, 1);
  assert.ok(calls[0] > Date.now() - 10000);
  const manager = props.find((p) => 'initialPage' in p);
  assert.ok(manager);
  assert.equal(manager.feeWaiver, campaign);
  assert.equal(manager.defaultCommissionBps, 1000);
});
