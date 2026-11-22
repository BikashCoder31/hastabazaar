import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {NATIVE_FORM_SOURCES} from '../lib/forms/native-source-contracts';
import {FORM_REGISTRY,IMPLEMENTED_FORM_ADAPTERS} from '../lib/forms/registry';
import {isFormCatalogEditable} from '../lib/forms/catalog-presentation';
import {coreFormContract} from '../lib/forms/core-contracts';
import {validateFormDraft,validateAnswersForDefinition} from '../lib/forms/validation';
import {collectFormSites,scanFormSites} from './helpers/form-policy';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {readFormHealth} from '../lib/operations/form-health';

const root=resolve(import.meta.dirname,'..');
const sourceCache=new Map<string,Promise<string|null>>();
function sourceText(path:string):Promise<string|null>{
  let source=sourceCache.get(path);
  if(!source){source=readFile(path,'utf8').catch(()=>null);sourceCache.set(path,source);}
  return source;
}
async function referencesOwner(path:string,target:string,seen=new Set<string>(),depth=0):Promise<boolean>{
  if(path===target)return true;
  if(seen.has(path)||depth>6)return false;
  seen.add(path);
  const source=await sourceText(path);if(source===null)return false;
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const dependencies:string[]=[];
  for(const node of ast.statements){
    if(!(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))||!node.moduleSpecifier||
      !ts.isStringLiteral(node.moduleSpecifier)||ts.isExportDeclaration(node)&&node.isTypeOnly||ts.isImportDeclaration(node)&&node.importClause?.phaseModifier===ts.SyntaxKind.TypeKeyword)continue;
    const specifier=node.moduleSpecifier.text;
    if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))continue;
    const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(path),specifier);
    for(const candidate of [base+'.ts',base+'.tsx',join(base,'index.ts')]){
      if(await sourceText(candidate)!==null){dependencies.push(candidate);break;}
    }
  }
  if(dependencies.includes(target))return true;
  for(const dependency of dependencies)if(await referencesOwner(dependency,target,seen,depth+1))return true;
  return false;
}

void test('native inventory alone remains Unknown with no invented load or durable-save evidence',async()=>{
  const fixture=serviceHealthFixture();
  try{
    fixture.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY);');
    fixture.sqlite.exec(await readFile(resolve(root,'drizzle/0151_form_health_records.sql'),'utf8'));
    for(const source of NATIVE_FORM_SOURCES){
      const [health]=await readFormHealth(fixture.db,'sa',{environment:'test',releaseId:'fictional-source-inventory',now:1000,formId:source.id});
      assert.equal(health.state,'unknown',source.id);
      assert.equal(health.lastLoad,null,source.id);
      assert.equal(health.lastSave,null,source.id);
    }
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) count FROM form_health_observations').get()!.count,0);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) count FROM form_answer_sets').get()!.count,0);
  }finally{fixture.sqlite.close();}
});

void test('native source IDs cover real receiving routes and preserve owning records outside generic answers',async()=>{
  const sites=await collectFormSites(root);
  for(const source of NATIVE_FORM_SOURCES){
    const definition=FORM_REGISTRY[source.id];
    assert.ok(sites.some(site=>site.formIds?.includes(source.id)),`${source.id}: actual rendered reference required`);
    assert.deepEqual(IMPLEMENTED_FORM_ADAPTERS[source.id],{formId:source.id,route:source.route,mode:source.mode});
    const route=source.route.replace(/:id\b/g,'[id]');
    const receivingPath=resolve(root,'app'+route+(route.startsWith('/api/')?'/route.ts':'/page.tsx'));
    const receiving=await readFile(receivingPath,'utf8');
    assert.match(receiving,route.startsWith('/api/')?/\bPOST\b/:/export default/);
    assert.ok((await readFile(resolve(root,source.owner),'utf8')).trim(),source.owner);
    assert.ok(await referencesOwner(receivingPath,resolve(root,source.owner)),`${source.id}: receiving route must reference its declared native owner`);
    assert.equal(isFormCatalogEditable(definition),false,source.id);
    assert.equal(coreFormContract(source.id),null,`${source.id}: inventory must not invent a versioned core receipt`);
    assert.equal(definition.capabilities.answerBehavior,source.mode==='query'?'query':'none');
    assert.ok(definition.baseFields.length>0&&definition.baseFields.every(field=>field.capability==='protected'));
    assert.throws(()=>validateFormDraft(source.id,{formId:source.id,fields:[{
      id:'extra',key:'extra',type:'long_text',label:'Extra question',required:true,status:'active',order:0,
    }]}),`${source.id}: generic questions cannot replace native required facts`);
    assert.throws(()=>validateAnswersForDefinition(definition,{formId:source.id,version:1,publishedAt:1,fields:[]},[
      {fieldId:'extra',value:'private evidence'},
    ]),`${source.id}: private domain data must not enter generic answer history`);
  }
});

void test('removing any actual newly inventoried native attribute restores an unidentified-form violation',async()=>{
  const sources=new Set([...NATIVE_FORM_SOURCES.map(source=>source.id),'staff.incident-review']);
  const sites=(await collectFormSites(root)).filter(site=>site.formIds?.some(id=>sources.has(id)));
  const fixture=await mkdtemp(join(tmpdir(),'native-source-policy-'));
  try{
    for(const site of sites){
      const source=await readFile(resolve(root,site.path),'utf8');
      const ast=ts.createSourceFile(site.path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      let ordinal=0;
      const attributes:ts.JsxAttribute[]=[];
      function visit(node:ts.Node):void{
        if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(ast)==='form'){
          ordinal++;
          if(ordinal===site.ordinal){
            const attribute=node.attributes.properties.find((property):property is ts.JsxAttribute=>ts.isJsxAttribute(property)&&property.name.getText(ast)==='data-form-id');
            if(attribute)attributes.push(attribute);
          }
        }
        ts.forEachChild(node,visit);
      }
      visit(ast);const attribute=attributes[0];assert.ok(attribute,`${site.path}:${site.line}`);
      const path=join(fixture,site.path);
      await mkdir(dirname(path),{recursive:true});
      await writeFile(path,source.slice(0,attribute.getStart(ast))+source.slice(attribute.end));
      const violations=await scanFormSites(fixture);
      assert.ok(violations.some(value=>value.path===site.path&&value.line===site.line&&value.reason==='Unregistered form site'),`${site.path}:${site.line} must fail when its real attribute is missing`);
      await rm(path);
    }
  }finally{await rm(fixture,{recursive:true,force:true});}
});
