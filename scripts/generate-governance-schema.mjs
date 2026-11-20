import {readFile,writeFile} from 'node:fs/promises';
import {mariaGovernanceSchema} from '../lib/operations/governance-schema.mjs';
import {mariaSystemOwnershipSchema} from '../lib/operations/system-ownership-schema.mjs';
import {notificationRuntimeMariaSource} from '../lib/operations/notification-schema.mjs';

for(const [source,target] of [
  ['0149_team_governance.sql','mariadb-team-governance.sql'],
  ['0150_incident_governance.sql','mariadb-incident-governance.sql'],
  ['0151_form_health_records.sql','mariadb-form-health-records.sql'],
  ['0152_review_task_system_ownership.sql','mariadb-review-task-system-ownership.sql'],
]) {
  const sqlite=await readFile(new URL('../drizzle/'+source,import.meta.url),'utf8');
  await writeFile(new URL('../deployment/babal/'+target,import.meta.url),source.startsWith('0152_')?mariaSystemOwnershipSchema(sqlite):mariaGovernanceSchema(sqlite));
}
await writeFile(new URL('../deployment/babal/mariadb-notification-runtime-compatibility.sql',import.meta.url),notificationRuntimeMariaSource(
  await readFile(new URL('../drizzle/0033_business_notifications.sql',import.meta.url),'utf8'),
  await readFile(new URL('../drizzle/0035_guest_business_notifications.sql',import.meta.url),'utf8'),
));
