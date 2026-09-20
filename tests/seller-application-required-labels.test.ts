import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createElement,type ComponentType} from 'react';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
void test('seller verification document labels identify required uploads and leave optional bank upload unmarked',async()=>{
 const compiled=await build({entryPoints:['components/seller/seller-application-form.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*']});
 const renderedModule={exports:{} as {SellerApplicationForm:ComponentType<{accountEmail?:string}>}};runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:renderedModule,exports:renderedModule.exports,process});
 for(const accountEmail of [undefined,'synthetic@example.test']){
  const html=renderToStaticMarkup(createElement(renderedModule.exports.SellerApplicationForm,{accountEmail}));
  assert.match(html,/name="applicantType"/);assert.match(html,/value="company"/);assert.match(html,/value="BOTH"/);assert.doesNotMatch(html,/name="registrationAuthority"|name="registrationNumber"|name="representativeName"|name="businessRegistration"|name="vatCertificate"/);
  const labels=html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g)??[];
  const inputs=html.match(/<input\b[^>]*>/g)??[];
  for(const id of ['panCertificate','representativeIdentity','bankVerification']){
   const label=labels.find(v=>v.includes('for="'+id+'"'));const input=inputs.find(v=>v.includes('name="'+id+'"'));assert.ok(label);assert.ok(input);const labelText=label.replace(/<[^>]*>/g,'');
   if(id!=='panCertificate'){assert.doesNotMatch(labelText,/\*/);assert.doesNotMatch(input,/ required(?:=|\s|>)/);}
   else{assert.match(labelText,/\*/,'Required upload '+id+' must have a visible label marker');assert.match(input,/ required(?:=|\s|>)/);}
  }
 }
});
