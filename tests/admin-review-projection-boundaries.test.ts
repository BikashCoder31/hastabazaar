import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {ensureReviewTask,listReviewTasks} from '../lib/workflows/review-tasks';

void test('a shared queue projection refuses permission loss or a newly conflicted source after its read',async()=>{
 for(const mode of ['permission','source_party']as const){const f=await completeVersionFixture(Date.now());try{
  f.sqlite.exec("UPDATE seller_participation_profiles SET application_stage='submitted' WHERE seller_id='maker';UPDATE staff_permission_profiles SET permissions_json='[\"seller.application.review\"]' WHERE user_id='delegate'");
  const taskId=await ensureReviewTask(f.db,{sourceType:'seller_application',sourceId:'maker',now:f.now});
  const before=await listReviewTasks(f.db,'delegate');assert.ok(before.some(task=>task.id===taskId));
  const prepare=f.db.prepare.bind(f.db);let armed=false,raced=false;
  f.db.prepare=sql=>{const statement=prepare(sql),first=statement.first.bind(statement),bind=statement.bind.bind(statement);let bindings:unknown[]=[];statement.bind=(...values)=>{bindings=values;return bind(...values);};statement.first=(async(column?:string)=>{
   const value=column===undefined?await first():await first(column);if(sql.includes('COALESCE(p.application_stage,s.status) AS stage')&&bindings[0]==='maker')armed=true;
   if(armed&&!raced&&sql.includes('p.permissions_json AS profile')){raced=true;if(mode==='permission')f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'");else f.sqlite.exec("UPDATE seller_profiles SET user_id='delegate' WHERE id='maker'");}
   return value;
  })as typeof statement.first;return statement;};
  const result=await listReviewTasks(f.db,'delegate').then(rows=>({rows}),()=>({rows:[]}));
  assert.equal(raced,true);assert.ok(!result.rows.some(row=>row.id===taskId),'No newly unauthorized source may leave the read boundary: '+mode);if(mode==='permission')assert.equal(result.rows.length,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM staff_permission_guards').get()!.n,0);
 }finally{f.dispose();}}
});
