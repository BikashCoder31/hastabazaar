import {mariaGovernanceSchema} from './governance-schema.mjs';
/** Append-only153 mapping. Unknown historical snapshots stay SQL NULL, not strings. */
export function mariaLegacyProtectedTransitionSchema(source){
 const sql=source.replace(/source_fingerprint NOT GLOB '\*\[\^0-9a-f\]\*'/g,"source_fingerprint NOT REGEXP BINARY '[^0-9a-f]'")
  .replace(/baseline_basis='cutover_observation'/g,"BINARY baseline_basis=BINARY 'cutover_observation'")
  .replace(/(NEW\.\w+) IS ((?:r|c)\.\w+)/g,'(BINARY $1<=>BINARY $2)');
 if(/\bGLOB\b|NEW\.\w+ IS (?:r|c)\./.test(sql))throw new Error('Unmapped legacy transition native comparison.');
 return mariaGovernanceSchema(sql).replace('review_task_id VARCHAR(191) NOT NULL','review_task_id VARCHAR(191) COLLATE utf8mb4_bin NOT NULL').replace('observed_bank_reference VARCHAR(191)','observed_bank_reference LONGTEXT');
}
