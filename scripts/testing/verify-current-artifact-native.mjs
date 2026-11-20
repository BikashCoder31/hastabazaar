import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2';
import {connectOwnedDatabase} from '../recovery/owned-recovery-operations.mjs';
import { stagingNativeFixture } from '../../tests/helpers/staging-native-fixture.ts';
import { inspectReadiness } from '../../lib/operations/readiness.ts';
import { extractStagingArchive } from '../deployment/staging-archive.mjs';
import { assertRequiredNativeResults } from '../recovery/native-test-results.mjs';
import { rehearseNativeRecovery } from '../recovery/rehearse-native.mjs';
import { readRegistrationMediaHandoff } from '../recovery/registration-media.mjs';
import { readFeeNativeMediaHandoff } from '../recovery/selected-native-media.mjs';
import { importSelectedRecoveryFixture, initializeSelectedFixture, selectedViewPlan } from '../recovery/selected-native-views.mjs';
import { attestCleanup, cooperativeCancellation, ownedLifecycle, safeEnvironment } from './verify-current-native.mjs';
import { withOwnedProcesses } from './verify-packaged-browser-gates.mjs';
import { verifyArtifactIdentity, verifySelectedPackage, assertSelectedConstraints, reviewedIdentityEnvironment, nativeReadinessAdapter } from './current-artifact-identity.mjs';
import { realPath } from '../local-release-source.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const secrets=[];
const mariadbImage = 'mariadb:10.11';
const sha256ImageId = /^sha256:[a-f0-9]{64}$/;
const ociImageIndex = 'application/vnd.oci.image.index.v1+json';
const ociImageManifest = 'application/vnd.oci.image.manifest.v1+json';
export const artifactNativePlan = Object.freeze([
  { file:'tests/accounting-native-runtime.test.ts', expected:1 },
  { file:'tests/commerce-financial-native.test.ts', expected:8 },
  { file:'tests/billing-release-native.test.ts', expected:1 },
  { file:'tests/fee-waiver-native.test.ts', expected:5 },
  ...['catchup','rollback','repair'].map(scenario => ({file:'tests/form-health-maria-native.test.ts', expected:1, scenario})),
  { file:'tests/customer-fee-native.test.ts', expected:29, recovery:true },
]);

/** @param {typeof image} [selected] */
export function assertReviewedImage(image, expected, selected) {
  assert.match(expected ?? '', sha256ImageId, 'Explicit reviewed cached MariaDB image ID required');
  const indexed = image.Descriptor?.mediaType === ociImageIndex;
  const platform = indexed ? selected : image;
  assert.ok(platform, 'Explicit x64 platform image inspection required for the local OCI index');
  assert.equal(platform.Id, expected);
  assert.ok(platform.RepoTags?.includes(mariadbImage));
  assert.equal(platform.Os, 'linux');
  assert.equal(platform.Architecture, 'amd64');
  if (!indexed) return { imageId: image.Id, platformManifest: null };

  assert.ok(image.RepoTags?.includes(mariadbImage));
  assert.match(image.Id, sha256ImageId);
  assert.notEqual(image.Id, expected);
  assert.equal(image.Descriptor.digest, image.Id);
  assert.ok(Number.isSafeInteger(image.Descriptor.size) && image.Descriptor.size > 0);
  const platformManifest = platform.Descriptor;
  assert.equal(platformManifest?.mediaType, ociImageManifest);
  assert.equal(platformManifest.digest, expected);
  assert.equal(platformManifest.platform?.os, 'linux');
  assert.equal(platformManifest.platform?.architecture, 'amd64');
  assert.ok(Number.isSafeInteger(platformManifest.size) && platformManifest.size > 0);
  return { imageId: image.Id, platformManifest };
}

export function assertReviewedContainerImage(container, reviewed) {
  assert.equal(container.Image, reviewed.imageId, 'Container must use the reviewed cached image bytes');
  if (reviewed.platformManifest) {
    assert.deepEqual(container.ImageManifestDescriptor, reviewed.platformManifest,
      'Container must select the exact reviewed Linux x64 manifest from the cached OCI index');
  }
}

export { initializeSelectedFixture };

export async function withExternalPolicyTemporary(project, parent, operation) {
  const base = await realPath(parent);
  const position = relative(project, base);
  assert.ok(position === '..' || position.startsWith('..' + sep) || isAbsolute(position),
    'Native policy temporary storage must be outside the project');
  const directory = await mkdtemp(resolve(base, 'hastabazaar-native-policy-'));
  const created = await lstat(directory);
  try {
    return await operation({ TEMP: directory, TMP: directory, TMPDIR: directory });
  } finally {
    const current = await lstat(await realPath(directory));
    assert.ok(current.isDirectory() && current.dev === created.dev && current.ino === created.ino,
      'Native policy temporary directory identity changed');
    await rm(directory, { recursive: true });
  }
}

export async function withPolicyTemporaryEnvironment(temporary, operation) {
  const previous = Object.fromEntries(Object.keys(temporary).map(key => [key, process.env[key]]));
  const applyTemporary = () => { Object.assign(process.env, temporary); };
  applyTemporary();
  try {
    return await operation(applyTemporary);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export async function cancellableChild(owner, command, args, options, timeout, cancellation) {
  let timer;
  const interrupted=new Promise((_,reject)=>{
    timer=setInterval(()=>{cancellation.checkpoint().catch(reject);},250);
  });
  try{return await Promise.race([owner.run(command,args,options,timeout),interrupted]);}
  finally{clearInterval(timer);}
}

async function main() {
  assert.equal(resolve(process.cwd()), project);
  assert.equal(process.argv.length, 2, 'No database or target arguments are accepted');
  const artifactDirectory = process.env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY;
  assert.ok(artifactDirectory, 'Exact reviewed packaged artifact required');
  const admitted = await verifyArtifactIdentity({project, artifactDirectory});
  const identityEnv = admitted.inventory.artifactKind === 'local-linux-candidate'
    ? reviewedIdentityEnvironment(process.env) : {GITHUB_SHA:process.env.GITHUB_SHA};
  const docker = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT && !process.env.DOCKER_TLS_VERIFY && !process.env.DOCKER_CERT_PATH, 'Docker overrides forbidden');
  const dockerRead = args => JSON.parse(execFileSync(docker, args, {encoding:'utf8',timeout:30000}))[0];
  const context = dockerRead(['context','inspect']);
  assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
  const imageId = process.env.HASTABAZAAR_REVIEWED_MARIADB_IMAGE_ID;
  const readReviewedImage = () => {
    const tagged = dockerRead(['image','inspect',mariadbImage]);
    const platform = tagged.Descriptor?.mediaType === ociImageIndex
      ? dockerRead(['image','inspect','--platform','linux/amd64',mariadbImage]) : undefined;
    return assertReviewedImage(tagged, imageId, platform);
  };
  const reviewedImage = readReviewedImage();
  const platformArgs = reviewedImage.platformManifest ? ['--platform','linux/amd64'] : [];
  const policyTempParent = await realpath(tmpdir());
  // Private disposable DB/media/key snapshots and ownership tokens must never be
  // included in the workflow's upload of the public release output directory.
  const evidenceParent=resolve(project,'.test-artifacts/t35');
  await mkdir(evidenceParent,{recursive:true});await realPath(evidenceParent);
  const evidence = resolve(evidenceParent, 'current-artifact-native-'+Date.now());
  await mkdir(evidence, {mode:0o700}); // Refuse overwrite/reuse, including failed evidence.
  const packageRoot = resolve(evidence,'package'); await mkdir(packageRoot);
  await extractStagingArchive(resolve(admitted.root,admitted.inventory.archive), packageRoot, admitted.inventory.files);
  const selected = await verifySelectedPackage(packageRoot, admitted.inventory);
  const { statements } = selectedViewPlan(selected);
  const workspace = resolve(project,'.superpowers/sdd/2026-10-16-staging-native-compatibility');
  await mkdir(workspace,{recursive:true});
  const cancel = cooperativeCancellation({requested:async()=>existsSync(resolve(evidence,'STOP'))});
  console.log('Cooperative stop: create '+resolve(evidence,'STOP'));
  const results=[];
  try {
    // Suites have conflicting fixed fixture identities and explicitly require
    // empty users. Each gets a NEW container/database; no reset or companion replay.
    for (const [index,target] of artifactNativePlan.entries()) {
      await cancel.checkpoint();
      const run=Date.now().toString(), name='hastabazaar-native-'+run, database='native_'+run+'_fresh';
      const directory=resolve(evidence,String(index)); await mkdir(directory,{mode:0o700});
      for(const leaf of ['tmp','media'])await mkdir(resolve(directory,leaf));
      const password=randomBytes(32).toString('hex'),token=randomBytes(24).toString('hex'),key=randomBytes(32).toString('base64url');
      secrets.push(password,token,key);
      const marker=resolve(workspace,'.native-'+run+'.json'), envFile=resolve(directory,'.container-env');
      await writeFile(envFile,'MARIADB_ROOT_PASSWORD='+password+'\nMARIADB_ROOT_HOST=%\n',{flag:'wx',mode:0o600});
      const env={...safeEnvironment(process.env),...identityEnv,
        TEMP:resolve(directory,'tmp'),TMP:resolve(directory,'tmp'),TMPDIR:resolve(directory,'tmp'),MEDIA_ROOT:resolve(directory,'media'),
        HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY:admitted.root,HASTABAZAAR_CURRENT_ARTIFACT_NATIVE:'1',
        HATSKALA_STAGING_NATIVE:'1',HATSKALA_NATIVE_MARKER:marker,HATSKALA_NATIVE_TOKEN:token,HASTABAZAAR_NATIVE_SECURITY_KEY:key,
        DB_HOST:'127.0.0.1',DB_PORT:'13329',DB_USER:'root',DB_PASSWORD:password,DB_NAME:database,
        ...(process.env.PLAYWRIGHT_MODULE?{PLAYWRIGHT_MODULE:process.env.PLAYWRIGHT_MODULE}:{}),
        ...(process.env.CHROME_PATH?{CHROME_PATH:process.env.CHROME_PATH}:{})};
      const redact=value=>String(value).replaceAll(password,'[redacted]').replaceAll(token,'[redacted]').replaceAll(key,'[redacted]');
      const owner={name,token,endpoint:context.Endpoints.docker.Host};
      let connection, containerId;
      const attest=id=>{
        const actual=dockerRead(['inspect',id]);
        attestCleanup(dockerRead(['context','inspect']),actual,{...owner,id});
        assertReviewedContainerImage(actual,reviewedImage);
      };
      const owned=async()=>{await cancel.checkpoint();attest(containerId);Object.assign(process.env,env);await stagingNativeFixture();};
      const query=async sql=>{await cancel.checkpoint();return connection.query({sql,timeout:30000});};
      const runChild=async(file,expected,scenario,temporary={})=>{
        await owned(); await verifyArtifactIdentity({project,artifactDirectory});
        await verifySelectedPackage(packageRoot,admitted.inventory);
        await assertSelectedConstraints(connection,selected.manifest);
        const feeHandoff=target.recovery&&file===target.file&&file==='tests/customer-fee-native.test.ts';
        const feeEnv=feeHandoff?{
          HASTABAZAAR_NATIVE_FEE_MEDIA_WORKSPACE:directory,
          HASTABAZAAR_NATIVE_FEE_MEDIA_CONTAINER_ID:containerId,
          HASTABAZAAR_NATIVE_FEE_MEDIA_ARCHIVE_SHA256:admitted.inventory.archiveSha256,
        }:{};
        const child=await withOwnedProcesses(owner=>cancellableChild(owner,process.execPath,
          ['--import','tsx','--test','--test-reporter=tap','--test-concurrency=1',file],
          {cwd:project,env:{...env,...feeEnv,...temporary,HASTABAZAAR_NATIVE_HEALTH_SCENARIO:scenario??''}},300000,cancel),45000);
        await writeFile(resolve(directory,file.split('/').at(-1)+'.tap'),redact(child.output),{flag:'wx'});
        assert.equal(child.code,0,'Required selected-schema child failed: '+file);
        const counts=assertRequiredNativeResults(child.output,expected);
        results.push({file,scenario,...counts}); await cancel.checkpoint();
        if(feeHandoff)return readFeeNativeMediaHandoff(child.output);
      };
      await ownedLifecycle({
        start:async()=>{
          await cancel.checkpoint();
          assert.deepEqual(readReviewedImage(),reviewedImage,'Reviewed cached MariaDB image changed during this run');
          await writeFile(resolve(directory,'ownership.json'),JSON.stringify(owner),{flag:'wx',mode:0o600});
          return execFileSync(docker,['run','-d','--pull=never',...platformArgs,'--name',name,'--label','codex.scope=staging-native-compatibility','--label','codex.native-owner='+token,'-p','127.0.0.1:13329:3306','--env-file',envFile,mariadbImage],{encoding:'utf8',timeout:30000}).trim();
        },
        persist:async id=>{
          containerId=id;attest(id);
          await writeFile(marker,JSON.stringify({id,name,database,password,token,host:'127.0.0.1',port:13329}),{flag:'wx',mode:0o600});
        },
        work:async()=>{
          await owned();
          for(let attempt=0;attempt<60;attempt++){
            await cancel.checkpoint();
            try{connection=await connectOwnedDatabase(config=>mysql.createConnection(config),{host:env.DB_HOST,port:13329,user:'root',password,connectTimeout:5000},{cancellation:cancel,timeoutMs:5000});break;}
            catch(error){if(error instanceof AggregateError)throw error;await cancel.checkpoint();await new Promise(resolve=>setTimeout(resolve,1000));}
          }
          assert.ok(connection,'Owned database did not become ready');
          assert.match((await query('SELECT VERSION() v'))[0][0].v,/^10\.11\./);
          let selectedViewBaseline;
          if(target.recovery){
            selectedViewBaseline=await importSelectedRecoveryFixture({
              connection,database,containerId,selected,archiveSha256:admitted.inventory.archiveSha256,owned,cancellation:cancel,
            });
          }else await initializeSelectedFixture({query,database,statements});
          await assertSelectedConstraints(connection,selected.manifest);
          const adapter=nativeReadinessAdapter(connection);
          assert.deepEqual(await inspectReadiness(adapter,'mariadb',selected.manifest),{ready:true,missing:[]});
          const feeNativeMediaManifestSha256=await runChild(target.file,target.expected,target.scenario);
          if(target.recovery)await withExternalPolicyTemporary(project,policyTempParent,async policyTemporary=>{
            await runChild('tests/hosted-security-native.test.ts',1,undefined,policyTemporary);
            await owned();
            const browser=await withOwnedProcesses(owner=>cancellableChild(owner,process.execPath,['--import','tsx','scripts/testing/verify-packaged-browser-gates.mts'],{cwd:project,env},600000,cancel),45000);
            await writeFile(resolve(directory,'browser.log'),redact(browser.output),{flag:'wx'});
            assert.equal(browser.code,0,'All packaged browser gates are required before recovery');
            const registrationMediaManifestSha256=readRegistrationMediaHandoff(browser.output);
            await owned();await verifyArtifactIdentity({project,artifactDirectory});
            const recovery=await withPolicyTemporaryEnvironment(policyTemporary,applyTemporary=>{
              const recoveryOwned=async()=>{await owned();applyTemporary();};
              return rehearseNativeRecovery({docker,marker:{id:containerId,name,database,password,token,host:'127.0.0.1',port:13329},owned:recoveryOwned,source:connection,workspace:directory,artifactDirectory:admitted.root,key,selectedPackageRoot:packageRoot,registrationMediaManifestSha256,feeNativeMediaManifestSha256,selectedViewBaseline,cancellation:cancel});
            });
            await writeFile(resolve(admitted.root,'native-recovery-verification.json'),JSON.stringify(recovery,null,2)+'\n',{flag:'wx'});
          });
          await assertSelectedConstraints(connection,selected.manifest);
        },
        close:async()=>{await connection?.destroy();},attest,
        stop:async id=>{execFileSync(docker,['stop',id],{stdio:'pipe',timeout:30000});},
        receipt:async outcome=>{
          const receipt=redact(JSON.stringify({target,...outcome,archiveSha256:admitted.inventory.archiveSha256,bootstrapSha256:selected.manifest.migrations[0].sha256,manifestSha256:selected.manifestSha256,requiredExactChecks:309,results,databasesPreserved:true},null,2));
          console.log(receipt);await writeFile(resolve(directory,'results.json'),receipt,{flag:'wx'});
        },
      });
    }
    await verifyArtifactIdentity({project,artifactDirectory});
    await verifySelectedPackage(packageRoot,admitted.inventory);
    await writeFile(resolve(admitted.root,'current-native-verification.json'),JSON.stringify({
      passed:true,artifactKind:admitted.inventory.artifactKind??'linux-release',commit:admitted.inventory.commit,
      sourceSha256:admitted.inventory.sourceSha256??null,archiveSha256:admitted.inventory.archiveSha256,
      bootstrapSha256:selected.manifest.migrations[0].sha256,manifestSha256:selected.manifestSha256,
      requiredExactChecks:309,results,productionReady:false,deploymentAuthorized:false,
    },null,2)+'\n',{flag:'wx'});
  }finally{cancel.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(secrets.reduce((message,secret)=>message.replaceAll(secret,'[redacted]'),String(error.message)));process.exitCode=1;});
