import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHomepageAttemptReference} from '../hooks/use-homepage-attempt-reference';
void test('homepage recovery retains a genuine five-group original UUID while malformed metadata stays blocked',()=>{
 const key='hastabazaar:profile-attempt:staff.homepage-hero-manager:reviewer:save:homepage_hero_slides',id='12345678-1234-1234-1234-123456789abc';
 assert.deepEqual(parseHomepageAttemptReference(JSON.stringify(['pending',key,id])),{state:'pending',key,requestId:id});
 for(const value of [id.replace('-1234-1234-','-1234-'),JSON.stringify({reason:'private'}),'','unavailable'])assert.deepEqual(parseHomepageAttemptReference(JSON.stringify(['pending',key,value])),{state:'invalid'});
 assert.deepEqual(parseHomepageAttemptReference(undefined),{state:'loading'});assert.deepEqual(parseHomepageAttemptReference('["empty"]'),{state:'empty'});
});
