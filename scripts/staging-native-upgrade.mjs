import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

/** Exact missing staging delta. No bootstrap/reset, backfill or saved offer writes. */
export async function stagingNativeUpgrade(project) {
  const steps=[];
  for(const name of ['mariadb-commission-workspace.sql','mariadb-loyalty-points.sql',
    'mariadb-company-store-maker-readiness.sql','mariadb-loyalty-scheduled-changes.sql']){
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
