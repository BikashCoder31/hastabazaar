import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {resolve} from 'node:path';
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {IntakeSnapshot} from '../lib/products/intake-workspace';
void test('retained Product video keeps its exact existing authorized link without inline media development',async()=>{
 const compiled=await build({entryPoints:['components/products/product-publication-facts.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],alias:{'next/image':resolve('node_modules/vinext/dist/shims/image.js')}});
 const renderedModule={exports:{} as {ProductPublicationFacts:ComponentType<{snapshot:IntakeSnapshot;title:string;uploads:readonly {id:string;mimeType:string}[];caseId?:string;publicMedia?:boolean}>}};
 runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:renderedModule,exports:renderedModule.exports,process,URL,console});
 // Existing metadata reference only: no video bytes, caption, track, narration,
 // new upload or playback assertion is created by this projection test.
 const snapshot:IntakeSnapshot={categoryId:null,answers:{nameEn:'Fictional retained product'},mediaIds:['retained-video'],offers:{axes:[],offers:[]},privateReview:{}},before=structuredClone(snapshot);
 for(const publicMedia of [false,true]){const html=renderToStaticMarkup(createElement(renderedModule.exports.ProductPublicationFacts,{snapshot,title:'Retained original facts',uploads:[{id:'retained-video',mimeType:'video/mp4'}],caseId:'original-case',publicMedia}));assert.doesNotMatch(html,/<video|<track|muted=/);assert.match(html,/Open original product video/);assert.ok(html.includes('href="'+(publicMedia?'/api/product-media/retained-video':'/api/seller/product-intakes/media/retained-video?caseId=original-case')+'"'));assert.doesNotMatch(html,/<figcaption[^>]*>Cover<\/figcaption>/);assert.deepEqual(snapshot,before);}
});
