import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

void test('actual promo server page does not quote legacy relief and forwards unchanged standard rate', async () => {
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
                /^(cloudflare:workers|next\/(navigation|link)|@\/lib\/auth\/staff|@\/lib\/db\/d1|@\/lib\/db\/repositories\/(promo-codes|incentive-reporting|commission-rates|fee-waivers)|@\/components\/admin\/(promo-code-manager|incentive-reports))$/,
            },
            (args) => ({ path: args.path, namespace: 'fixture' }),
          );
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
            const path = args.path;
            const contents =
              path === 'cloudflare:workers'
                ? 'export const env={DB:{fixture:true}}'
                : path === 'next/navigation'
                  ? 'export function redirect(){throw Error("Denied")};export function notFound(){throw Error("Unexpected missing selection")}'
                  : path === 'next/link'
                    ? 'export default function Link(){}'
                  : path.endsWith('/staff')
                    ? 'export async function requireStaffPage(){return {id:"owner",authSubject:"owner",role:"super_admin"}}'
                    : path.endsWith('/d1')
                      ? 'export const requireDatabase=e=>e.DB'
                      : path.endsWith('/promo-codes')
                        ? 'export async function listPromoCampaigns(){return {campaigns:[],nextCursor:null}};export async function getPromoCampaign(){throw Error("Unexpected selected campaign")}'
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
  assert.equal(calls.length, 0);
  const manager = props.find((p) => 'initialPage' in p);
  assert.ok(manager);
  assert.equal(manager.feeWaiver, undefined);
  assert.equal(manager.defaultCommissionBps, 1000);
});

for (const path of ['app/cart/page.tsx', 'app/checkout/page.tsx'])
  void test(`${path} forwards the server customer fee snapshot including campaign relief`, async () => {
    const snapshot = {enabled:true,amountPaisa:2500,chargedPaisa:0,versionId:'future-policy',rule:'non_refundable_except_law_v1',schemaVersion:2,standardPaisa:2500,waivedPaisa:2500,campaign:{id:'customer',revision:2,name:'Customer launch'}};
    const calls:number[]=[];
    const output=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*'],plugins:[{name:'customer-page',setup(b){
      // Exercise the actual corrected wrapper and its default current-time read.
      b.onResolve({filter:/^\.\/customer-service-fees$/},args=>args.importer.endsWith('platform-service-fee.ts')?{path:'@/lib/db/repositories/customer-service-fees',namespace:'fixture'}:undefined);
      b.onResolve({filter:/^(cloudflare:workers|next\/(headers|link)|@\/components\/|@\/lib\/(db\/|auth\/|checkout\/(policy-context|payment-capabilities)|orders\/first-cod-review))/},args=>args.path.endsWith('/platform-service-fee')?undefined:{path:args.path,namespace:'fixture'});
      b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
        const p=args.path;
        const contents=p==='cloudflare:workers'?'export const env={DB:{fixture:true}}'
          :p==='next/link'?'export default function Link(){}'
          :p==='next/headers'?'export async function cookies(){return {get(){return null}}}'
          :p.endsWith('/d1')?'export const requireDatabase=e=>e.DB'
          :p.endsWith('/customer-service-fees')?'export async function quoteCustomerServiceFee(db,at){if(!db.fixture)throw Error("Wrong database");globalThis.quoteCalls.push(at);return {snapshot:globalThis.snapshot}}'
          :p.endsWith('/delivery-rates')?'export async function getDeliveryRates(){return {}}'
          :p.endsWith('/customer')?'export async function getCustomerUser(){return null}'
          :p.endsWith('/first-cod-review')?'export async function customerMustConfirmCod(){throw Error("Anonymous checkout must not read COD confirmation settings")}'
          :p.endsWith('/contact-verification')?'export async function getContactVerificationStatus(){return null};export const resolveCheckoutContactPolicy=()=>"email_and_phone"'
          :p.endsWith('/wallet')?'export async function getWallet(){return null}'
          :p.endsWith('/customers')?'export async function listCustomerAddresses(){return []}; export async function listWishlist(){return []}'
          :p.endsWith('/policy-context')?'export async function getCheckoutPolicyContext(){return "reviewed-policy"}'
          :p.endsWith('/payment-capabilities')?'export async function readCheckoutPaymentCapabilities(db,input){if(!db.fixture||input.cartHash!==null)throw Error("Unexpected payment capability scope");return {cod:false,manual_bank:false,state:"empty"}}'
          :'export function CartView(){};export function CheckoutForm(){};export function CheckoutHeader(){};export function SiteFooter(){};export function SiteHeader(){}';
        return {loader:'js',contents};
      });
    }}]});
    const result={exports:{} as {default:()=>Promise<unknown>}};
    runInNewContext(output.outputFiles[0].text,{module:result,exports:result.exports,require:createRequire(import.meta.url),process,snapshot,quoteCalls:calls});
    const tree=await result.exports.default();
    const found:Record<string,unknown>[]=[];
    function visit(node:unknown) {
      if(!node || typeof node!=='object')return;
      const props=(node as {props?:Record<string,unknown>}).props;
      if(!props)return;
      if('serviceFee' in props)found.push(props);
      const children=props.children;
      if(Array.isArray(children))children.forEach(visit);else visit(children);
    }
    visit(tree);
    assert.equal(calls.length,1);assert.ok(calls[0]>Date.now()-10000);
    assert.equal(found.length,1);assert.equal(found[0].serviceFee,snapshot);
    if(path.includes('checkout'))assert.equal(found[0].policyContext,'reviewed-policy');
  });
