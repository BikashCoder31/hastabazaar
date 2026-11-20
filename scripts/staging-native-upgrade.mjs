import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

// Rehearsal candidates only. Select any hosted delta from a current read-only
// host inventory and review it separately. This function executes no SQL.
const reviewed = ['mariadb-commission-workspace.sql','mariadb-loyalty-points.sql',
  'mariadb-company-store-maker-readiness.sql','mariadb-loyalty-scheduled-changes.sql',
  'mariadb-marketplace-fee-waivers.sql', 'mariadb-customer-service-fee-waivers.sql'];
export async function stagingNativeUpgrade(project, selected = reviewed) {
  assert.ok(Array.isArray(selected) && selected.length > 0 && new Set(selected).size === selected.length, 'Select a nonempty unique reviewed delta');
  assert.ok(selected.every(name => reviewed.includes(name)), 'Unreviewed native upgrade source');
  const steps=[];
  for(const name of reviewed.filter(name => selected.includes(name))){
    const source=(await readFile(resolve(project,'deployment/babal',name),'utf8')).replace(/\r\n/g,'\n');
    let sql=source;
    if(name==='mariadb-loyalty-points.sql'){
      const marker='-- Weekly loyalty cycle extension';
      if(source.split(marker).length!==2)throw new Error('Weekly extension boundary changed; review the staging delta.');
      sql=source.slice(source.indexOf(marker));
    }
    steps.push({name,sql:sql.trim()+'\n',sourceSha256:createHash('sha256').update(source).digest('hex')});
  }
  const sql=steps.map(step=>'-- Reviewed staging delta: '+step.name+'\n'+step.sql).join('\n');
  return{steps,sql,sha256:createHash('sha256').update(sql).digest('hex')};
}
