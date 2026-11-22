import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedEmailJob} from '../lib/email/job-auth';
void test('scheduler and independent monitor credentials require exact bounded bearer headers',async()=>{
 const secret='fictional-local-job-secret-0123456789';
 assert.equal(await authorizedEmailJob(new Request('http://localhost/job',{headers:{authorization:'Bearer '+secret}}),secret),true);
 assert.equal(await authorizedEmailJob(new Request('http://localhost/job?secret='+secret),secret),false);
 assert.equal(await authorizedEmailJob(new Request('http://localhost/job',{headers:{authorization:'Bearer '+secret+'x'}}),secret),false);
 assert.equal(await authorizedEmailJob(new Request('http://localhost/job',{headers:{authorization:'Bearer '+secret}}),'short'),false);
 assert.equal(await authorizedEmailJob(new Request('http://localhost/job',{headers:{authorization:'Bearer '+'x'.repeat(513)}}),secret),false);
});
