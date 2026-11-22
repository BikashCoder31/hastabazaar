import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MonitorError, launchLockedCli, readCliConfiguration, requestJson, validateHttpsUrl } from './email-automation-watchdog.mjs';

export function validateSenderConfig(config){
 if(!config||config.version!==1||config.enabled!==true||!['production','development'].includes(config.environment)||config.hostMappingReviewed!==true||typeof config.mappingReference!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,159}$/.test(config.mappingReference)||typeof config.lockPath!=='string'||!config.lockPath.startsWith('/'))throw new MonitorError('sender_host_mapping_unverified');
 validateHttpsUrl(config.jobUrl,config.allowedAppOrigin,'/api/jobs/order-emails');return config;
}
export async function runSenderTick(config,dependencies={}){
 validateSenderConfig(config);
 const result=await requestJson(config.jobUrl,{secret:dependencies.secret,timeoutMs:55_000,maxBytes:32_768},dependencies.fetch??globalThis.fetch);
 const now=dependencies.now?.()??Date.now(),value=result.data;
 if(!value||value.environment!==config.environment||!Number.isSafeInteger(value.observedAt)||value.observedAt<now-90_000||value.observedAt>now+30_000||typeof value.ok!=='boolean')throw new MonitorError('sender_response_unverified');
 return{environment:config.environment,ok:result.ok&&value.ok,observedAt:value.observedAt};
}
export async function senderCli(argv=process.argv.slice(2)){
 const input=await readCliConfiguration(argv);validateSenderConfig(input.config);
 if(!input.ownsLock)return launchLockedCli(fileURLToPath(import.meta.url),input.path,input.config.lockPath);
 const result=await runSenderTick(input.config,{secret:process.env.ORDER_EMAIL_JOB_SECRET});
 console.log(JSON.stringify({component:'email-automation-sender',environment:result.environment,ok:result.ok,observedAt:result.observedAt}));return result.ok?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){senderCli().then(code=>{process.exitCode=code;}).catch(error=>{console.error(JSON.stringify({component:'email-automation-sender',error:error instanceof MonitorError?error.code:'sender_unavailable'}));process.exitCode=1;});}
