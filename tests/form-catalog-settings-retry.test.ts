import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {stubFixtureLink} from './helpers/browser-fixture-link';
import { businessSettingFormId } from '../lib/db/repositories/business-settings';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { validateAnswersForDefinition, validateFormDraftForDefinition } from '../lib/forms/validation';

interface FixtureRoute {
  request(): { method(): string; postData(): string | null };
  fulfill(options: { status: number; contentType: string; body: string }): Promise<void>;
}

async function assertMountedPayload(target: (typeof targets)[number], body: Record<string, unknown>) {
  assert.ok(Number.isSafeInteger(body.formVersion));
  assert.equal(body.version, undefined, 'The wire contract uses formVersion, not the multipart helper version alias.');
  const config = { formId: target.id, fields: [{ id: 'review_context', key: 'review_context',
    label: 'Review context', type: 'short_text', required: true, order: 0, status: 'active' }] };
  businessSettingFormId(
    target.mode === 'hero' ? 'homepage_hero_slides' : target.mode === 'occasion' ? 'homepage_occasion_slides' : 'official_social_links',
    body.sourceFormId);
  const definition={...FORM_REGISTRY[target.id],capabilities:{...FORM_REGISTRY[target.id].capabilities,customFieldTypes:['short_text' as const]}};
  const draft=validateFormDraftForDefinition(definition,config);
  const validated=validateAnswersForDefinition(definition,{...draft,version:Number(body.formVersion),publishedAt:1},body.customAnswers);
  assert.equal(validated.version, body.formVersion);
  assert.equal(validated.answers[0].value, (body.customAnswers as { value: string }[])[0].value);
}

const targets = [
  { id: 'staff.homepage-hero-manager', mode: 'hero', button: 'Save private draft' },
  { id: 'staff.homepage-occasion-manager', mode: 'occasion', button: 'Save private draft' },
  { id: 'staff.business-settings-manager', mode: 'general', button: 'Save draft' },
  { id: 'staff.business-settings-manager', mode: 'general', button: 'Save changes' },
] as const;

void test('settings editors retain opaque exact retries through malformed replies and refresh explicitly rejected form versions', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- The browser runtime is loaded dynamically from the optional external dependency.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {HomepageHeroManager} from './components/admin/homepage-hero-manager';
    import {HomepageOccasionManager} from './components/admin/homepage-occasion-manager';
    import {BusinessSettingsManager} from './components/admin/business-settings-manager';
    import {INITIAL_HOMEPAGE_HERO_SLIDES} from './lib/homepage/hero-slides';
    import {INITIAL_HOMEPAGE_OCCASION_SLIDES} from './lib/homepage/occasion-slides';
    const requestedAction=new URLSearchParams(location.search).get('action');
    const links={linkedin:'https://linkedin.com/company/hastabazaar',x:'https://x.com/Hastabazaar',tiktok:'https://tiktok.com/@hastabazaar',
      instagram:'https://instagram.com/hastabazaar',facebook:'https://www.facebook.com/hastabazaar',youtube:'https://www.youtube.com/@hastabazaar'};
    const version={id:'fixture-version',key:'official_social_links',version:1,revision:1,value:links,
      status:requestedAction==='reverse'?'published':requestedAction==='approve'||requestedAction==='reject'?'pending_approval':'draft',
      changeControl:requestedAction==='submit'?'controlled':'simple',effectiveFrom:0,effectiveUntil:null,reason:'Fictional version history'};
    const setting={key:'official_social_links',label:'Social links',description:'Official links',sensitivity:'public',
      changeControl:'simple',effectiveMode:'prospective',snapshotOnTransaction:false,affectedSurfaces:[],requiredCapability:null,
      effective:{key:'official_social_links',value:links,source:'default',version:null,versionId:null,effectiveFrom:null,approvedBy:null},history:requestedAction?[version]:[]};
    const mode=new URLSearchParams(location.search).get('mode');
    createRoot(document.getElementById('root')).render(mode==='hero'
      ? <HomepageHeroManager actorId={'reviewer'} initialSlides={[]} initialMedia={[]} history={requestedAction?[{...version,key:'homepage_hero_slides',value:INITIAL_HOMEPAGE_HERO_SLIDES}]:[]} asOf={1}/>
      : mode==='occasion' ? <HomepageOccasionManager actorId={'reviewer'} initialSlides={[]} history={requestedAction?[{...version,key:'homepage_occasion_slides',value:INITIAL_HOMEPAGE_OCCASION_SLIDES}]:[]} asOf={1}/>
      : <BusinessSettingsManager actorId={'reviewer'} initialSettings={[setting]} asOf={1}/>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'settings-retry-stubs', setup(bundler) {
      stubFixtureLink(bundler);
      bundler.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'settings-stub'}));
      bundler.onLoad({filter:/^navigation$/,namespace:'settings-stub'},()=>({contents:'export function useRouter(){return{refresh(){}}}',loader:'js'}));
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'settings-stub' }));
      bundler.onResolve({ filter: /^@\/components\/admin\/homepage-hero-preview$/ }, () => ({ path: 'hero-preview', namespace: 'settings-stub' }));
      bundler.onResolve({ filter: /^@\/components\/homepage\/homepage-occasion-carousel$/ }, () => ({ path: 'occasion-preview', namespace: 'settings-stub' }));
      bundler.onLoad({ filter: /^config$/, namespace: 'settings-stub' }, () => ({ contents: `
        import {useState} from 'react';
        export function usePublishedFormConfig(formId){const [state,setState]=useState({status:'ready',version:1});return {config:{formId,version:state.version,publishedAt:1,
          fields:[{id:'review_context',key:'review_context',label:'Review context',type:'short_text',required:true,order:0,status:'active'}]},
          canSubmit:state.status==='ready',status:state.status,message:'',
          refresh(){window.refreshCalls=(window.refreshCalls??0)+1;setState({...state,status:'loading'});
            window.resolveFormRefresh=()=>setState({status:'ready',version:2});},
          handleSubmissionResponse(response,code){window.staleCodes??=[];window.staleCodes.push(code);
            if(code==='stale_version')setState({...state,status:'stale'});}}}
      `, loader: 'js', resolveDir: process.cwd() }));
      bundler.onLoad({ filter: /^(hero-preview|occasion-preview)$/, namespace: 'settings-stub' }, () => ({ contents: 'export function HomepageHeroPreview(){return null};export function HomepageOccasionCarousel(){return null}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const target of targets) {
      const page = await browser.newPage();
      const bodies: Record<string, unknown>[] = [];
      try {
        await page.route('https://settings-retry.test/**', (route: FixtureRoute) => {
          if (route.request().method() === 'POST') {
            bodies.push(JSON.parse(route.request().postData() ?? '{}'));
            const response = bodies.length === 1 ? [503, 'Response lost after save']
              : bodies.length < 4 ? [409, 'Request reference already used for different content']
                : [200, 'Saved'];
            return route.fulfill({ status: response[0] as number, contentType: 'application/json',
              body: JSON.stringify(bodies.length < 4 ? { error: response[1] }
                : bodies.length === 4 ? {} : bodies.length === 5 ? null : bodies.length === 6 ? {error:'Saved'}
                  : bodies.length === 7 ? {draft:{id:'wrong-key',key:'wrong',status:'draft',revision:1,version:1}}
                    : bodies.length === 8 ? {draft:{id:'missing-value',key:bodies.at(-1)?.key,status:'draft',revision:1,version:1}}
                      : bodies.length === 9 ? {draft:{id:'invalid-value',key:bodies.at(-1)?.key,status:'draft',revision:1,version:1,value:'invalid'}}
                    : bodies.at(-1)?.action === 'save'
                      ? {ok:true,action:'save',version:{id:'saved-version',key:bodies.at(-1)?.key,status:'published',revision:1,version:1,effectiveFrom:1,value:bodies.at(-1)?.value}}
                      : {draft:{id:'saved-draft',key:bodies.at(-1)?.key,status:'draft',revision:1,version:1,value:bodies.at(-1)?.value}}) });
          }
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        });
        const mount = async () => page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.goto(`https://settings-retry.test/?mode=${target.mode}`);
        await mount();
        const form = page.locator(`form[data-form-id="${target.id}"]`);
        await form.getByLabel('Review context').fill('Fictional review evidence');
        await form.getByLabel('Reason and expected impact').fill('Fictional settings review');
        await form.getByRole('button', { name: target.button }).click();
        await form.getByText('Response lost after save').waitFor();
        const firstId = bodies[0].requestId;
        await assertMountedPayload(target, bodies[0]);
        if (target.button === 'Save changes') {
          assert.equal(bodies.length, 1, 'The primary save issues one mutation request.');
          assert.equal(bodies[0].action, 'save');
          assert.equal(bodies[0].effectiveFrom, null);
          assert.equal(bodies[0].expectedVersion, 0);
        }
        assert.match(String(firstId), /^[0-9a-f-]{36}$/i);
        const stored = await page.evaluate(() => Object.entries(sessionStorage));
        assert.ok(stored.some(([, value]: [string, string]) => value === firstId), `${target.mode}: opaque attempt survives`);
        assert.ok(stored.every(([, value]: [string, string]) => typeof value === 'string' && !value.includes('Fictional')));

        // Actual native reload/ownership recovery is exercised in homepage-content-browser and commercial-workspace-browser.
        // This retained fixture keeps the independent malformed-success/custom-answer decoder matrix.
        const retry=()=>form.getByRole('button',{name:target.mode==='general'?target.button:'Retry original action',exact:true});
        for(let index=1;index<9;index++){
          await retry().click();
          await form.getByText(index<3?'Request reference already used for different content':'The response could not be verified. Retry with the same request.',{exact:true}).waitFor();
          await assertMountedPayload(target,bodies[index]);
          assert.deepEqual(bodies[index],bodies[0],'A response failure cannot change the original request or configured answers.');
          assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(firstId)),true);
        }
        const reloaded=page.waitForEvent('load');await retry().click();await reloaded;
        assert.deepEqual(bodies[9],bodies[0]);
        assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(firstId)),false,'Only a validated success clears the original reference.');
      } finally { await page.close(); }
    }
    for(const target of targets) for(const action of target.mode==='general'
      ? ['publish','approve','reject','reverse'] : ['publish','reverse']){
      const page=await browser.newPage();
      const bodies:Record<string,unknown>[]=[];
      try{
        await page.route('https://settings-retry.test/**',(route:FixtureRoute)=>{
          if(route.request().method()!=='POST')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<div id="root"></div>'});
          const body=JSON.parse(route.request().postData()??'{}');bodies.push(body);
          const step=bodies.length;
          const response=step===1?{status:409,body:{error:'Domain conflict',phase:'rejected_before_write'}}
            :step===2?{status:409,body:{error:'Stale form',code:'stale_version',phase:'rejected_before_write'}}
              :step===3?{status:200,body:{}}:step===4?{status:200,body:null}
                :step===5?{status:200,body:{ok:true,action:'unrelated'}}:step===6?{status:200,body:{error:'Saved'}}
                  :{status:200,body:action==='reverse'
                    ?{action,draft:{id:'restored-draft',key:target.mode==='hero'?'homepage_hero_slides':target.mode==='occasion'?'homepage_occasion_slides':'official_social_links',
                      value:target.mode==='general'?{linkedin:'https://linkedin.com/company/hastabazaar',x:'https://x.com/Hastabazaar',tiktok:'https://tiktok.com/@hastabazaar',
                        instagram:'https://instagram.com/hastabazaar',facebook:'https://www.facebook.com/hastabazaar',youtube:'https://www.youtube.com/@hastabazaar'}:[],status:'draft',revision:1,version:2}}
                    :{ok:true,action}};
          return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(response.body)});
        });
        await page.goto(`https://settings-retry.test/?mode=${target.mode}&action=${action}`);
        await page.addScriptTag({content:bundle.outputFiles[0].text});
        const form=page.locator(`form[data-form-id="${target.id}"]`);
        await form.getByLabel('Review context').fill('Fictional action context');
        await form.getByLabel('Reason and expected impact').fill('Fictional settings action');
        if(target.mode!=='general')await form.locator('input[type="datetime-local"]').fill('2030-01-01T12:00');
        const button=form.getByRole('button',{name:action==='submit'?'Submit for review':action==='approve'?'Approve / schedule':action==='reject'?'Reject'
          :action==='reverse'?(target.mode==='general'?'Create reversal draft':'Create restoration draft'):'Publish / schedule',exact:true});
        for(let step=1;step<=6;step++){
          await (target.mode!=='general'&&step>=4?form.getByRole('button',{name:'Retry original action',exact:true}):button).click();
          await form.getByText(step===1?'Domain conflict':step===2?'Stale form':'The response could not be verified. Retry with the same request.',{exact:true}).waitFor();
          const expectedId=step<=2?(target.mode==='general'?bodies[0].requestId:bodies[step-1].requestId):bodies[2].requestId;
          await assertMountedPayload(target, bodies.at(-1)!);
          assert.equal(bodies.at(-1)?.requestId,expectedId);
          assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(expectedId)),target.mode==='general'||step>=3);
          assert.deepEqual(await page.evaluate(()=> (window as unknown as {staleCodes?:string[]}).staleCodes??[]),step===1?[]:['stale_version']);
          if(step===2){
            assert.equal(await button.isEnabled(),false);
            if(target.mode==='general'){
            page.once('dialog',(dialog:{dismiss():Promise<void>})=>dialog.dismiss());
            await form.getByRole('button',{name:/Start a new attempt/i}).click();
            assert.equal(await button.isEnabled(),false);
            assert.equal(await page.evaluate(()=> (window as unknown as {refreshCalls?:number}).refreshCalls??0),0);
            assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(expectedId)),true);
            page.once('dialog',(dialog:{accept():Promise<void>})=>dialog.accept());
            await form.getByRole('button',{name:/Start a new attempt/i}).click();
            assert.equal(await page.evaluate(()=> (window as unknown as {refreshCalls?:number}).refreshCalls??0),1);
            assert.equal(await button.isEnabled(),false,'Refreshing configuration must finish before another submission.');
            assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(expectedId)),false);
            }else{
              await form.getByRole('button',{name:'Refresh form',exact:true}).click();
              assert.equal(await page.evaluate(()=> (window as unknown as {refreshCalls?:number}).refreshCalls??0),1);
              assert.equal(await button.isEnabled(),false,'The replacement form must finish loading before another action.');
              assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(expectedId)),false);
            }
            await page.evaluate(()=> (window as unknown as {resolveFormRefresh:()=>void}).resolveFormRefresh());
          }
          if(step>=3){assert.notEqual(expectedId,bodies[0].requestId);assert.equal(bodies.at(-1)?.formVersion,2);}
        }
        const reloaded=page.waitForEvent('load');await (target.mode==='general'?button:form.getByRole('button',{name:'Retry original action',exact:true})).click();await reloaded;
        assert.equal(bodies.at(-1)?.requestId,bodies[2].requestId);
        assert.equal(await page.evaluate((id:string)=>Object.values(sessionStorage).includes(id),String(bodies[2].requestId)),false);
      }finally{await page.close();}
    }
  } finally { await browser.close(); }
});
