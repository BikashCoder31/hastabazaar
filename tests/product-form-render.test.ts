import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createElement,type ComponentType} from 'react';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
import {productDetailGroups,type CategoryDetailModel} from '../lib/products/category-fields';
import {stubFixtureImage,stubFixtureLink} from './helpers/browser-fixture-link';
void test('actual optional workspace renders three steps, every detail group, one optional cover and honest unknown customer facts',async()=>{
 const compiled=await build({
  entryPoints:['components/seller/product-intake-workspace.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],
  plugins:[{name:'product-static-framework',setup(bundler){
   stubFixtureLink(bundler);
   stubFixtureImage(bundler);
   bundler.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'product-static-framework'}));
   bundler.onLoad({filter:/^navigation$/,namespace:'product-static-framework'},()=>({
    contents:'exports.useRouter=()=>({refresh(){throw Error("Unexpected router refresh during static render");}});',
    loader:'js',
   }));
  }}],
 });
 const renderedModule={exports:{} as {ProductIntakeWorkspace:ComponentType<{categories:unknown[];occasions:unknown[];initialCategoryModel:CategoryDetailModel}>}};runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:renderedModule,exports:renderedModule.exports,process,structuredClone});
 const model:CategoryDetailModel={categoryId:null,name:null,parentId:null,status:'unknown',versionId:null,revision:null,contract:null,groups:productDetailGroups.map(group=>({...group,recommended:false}))};
 const html=renderToStaticMarkup(createElement(renderedModule.exports.ProductIntakeWorkspace,{categories:[{id:'other',nameEn:'Others'}],occasions:[{id:'other',nameEn:'Others'}],initialCategoryModel:model}));
 for(const group of productDetailGroups)assert.ok(html.includes(group.label));for(const text of ['Basics','Photos &amp; details','Review','Cover photo','Additional product photos','Product video','Product name not provided','Price not provided','Availability needs confirmation'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/<(?:input|select|textarea)\b[^>]*\srequired(?:=|\s|>)/);assert.doesNotMatch(html,/at least four|name="sku"|>Free<|In stock/);assert.match(html,/name="producer"/);assert.match(html,/name="nameNe"/);assert.match(html,/name="descriptionNe"/);
});
