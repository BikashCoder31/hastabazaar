import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createElement,type ComponentType} from 'react';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
void test('actual new product form omits removed fields and exposes four required photos plus optional video',async()=>{
 const compiled=await build({entryPoints:['components/seller/product-submission-form.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'test-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"const React=require('react');module.exports=function Link(props){return React.createElement('a',props);};",loader:'js'}));}}]});
 const renderedModule={exports:{} as {ProductSubmissionForm:ComponentType<{categories:unknown[];occasions:unknown[]}>}};runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:renderedModule,exports:renderedModule.exports,process});
 const html=renderToStaticMarkup(createElement(renderedModule.exports.ProductSubmissionForm,{categories:[{id:'other',nameEn:'Others'}],occasions:[{id:'other',nameEn:'Others'}]}));
 for(const field of ['producer','materials','sku'])assert.doesNotMatch(html,new RegExp('name="'+field+'"'));
 const inputs=html.match(/<input\b[^>]*>/g)??[];for(let i=1;i<=4;i++){const tag=inputs.find(v=>v.includes('name="image'+i+'"'));assert.ok(tag);assert.match(tag,/ required(?:=|\s|>)/);}
 assert.doesNotMatch(inputs.find(v=>v.includes('name="image5"'))??'',/ required(?:=|\s|>)/);assert.match(html,/name="video"/);assert.match(html,/Product description/);assert.match(html,/Time needed to prepare the product/);
});
