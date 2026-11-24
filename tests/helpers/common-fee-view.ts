import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {stubFixtureLink} from './browser-fixture-link';
import type {getCommonFeeState} from '../../lib/commission/coordinated-policy';
export type FeeState=Awaited<ReturnType<typeof getCommonFeeState>>;
export function feeView(overrides:Partial<FeeState>={}):FeeState{return {asOf:Date.UTC(2026,9,28),revision:0,context:'a'.repeat(64),current:{registered:{versionId:'fixture-registered',basisPoints:725,effectiveAt:1},managed:{versionId:'fixture-managed',basisPoints:725,effectiveAt:1}},upcoming:null,issues:[],history:[],sources:[],maximums:[],legacyFuture:[],initialPublicationAvailable:false,...overrides};}
export const futurePolicy={id:'future-policy',registeredSettingId:'future-registered',managedSettingId:'future-managed',basisPoints:1200,effectiveAt:Date.UTC(2026,10,10,18,15),publishedAt:Date.UTC(2026,9,20),reason:'Isolated common fee schedule',termsText:'Recorded fictional common terms',replacesId:null,cancelledAt:null,replacementId:null};
export async function renderCommonFee(state:FeeState){const bundle=await build({entryPoints:['components/admin/common-fee-policy.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*'],plugins:[{name:'isolated-navigation',setup(builder){stubFixtureLink(builder);builder.onResolve({filter:/^next\/navigation$/},args=>({path:args.path,namespace:'test-navigation'}));builder.onLoad({filter:/.*/,namespace:'test-navigation'},()=>({loader:'js',contents:'exports.useRouter=()=>({refresh(){}});'}));}}]});const loadedFixtureModule={exports:{} as {CommonFeePolicy:ComponentType<{state:FeeState}>}};runInNewContext(bundle.outputFiles[0].text,{module:loadedFixtureModule,exports:loadedFixtureModule.exports,require:createRequire(import.meta.url),process,Date,Intl,crypto:globalThis.crypto});return renderToStaticMarkup(createElement(loadedFixtureModule.exports.CommonFeePolicy,{state}));}
