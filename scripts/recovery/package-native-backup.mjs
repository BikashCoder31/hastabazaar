import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createNativeRecoveryBundle} from './native-recovery.mjs';

// Operator-only packaging of a separately reviewed, paused native snapshot.
// There is deliberately no database connection, restore, or network capability.
assert.equal(process.argv.length,4,'Usage: node --import tsx scripts/recovery/package-native-backup.mjs --plan <reviewed-plan.json>');
assert.equal(process.argv[2],'--plan');
const plan=JSON.parse(await readFile(resolve(process.argv[3]),'utf8'));
assert.deepEqual(Object.keys(plan).sort(),['output','provenance','snapshot','writePauseEvidence']);
assert.ok(typeof plan.writePauseEvidence==='string'&&plan.writePauseEvidence.length>=20&&plan.writePauseEvidence.length<=2000,'Record the reviewed source pause/cutoff evidence before packaging');
assert.ok(typeof plan.snapshot==='string'&&typeof plan.output==='string');
assert.equal(resolve(plan.snapshot),plan.snapshot);assert.equal(resolve(plan.output),plan.output);
let secret='';for await(const chunk of process.stdin){secret+=chunk.toString();assert.ok(Buffer.byteLength(secret)<=4096,'Secret input exceeds limit');}
const input=JSON.parse(secret);assert.deepEqual(Object.keys(input),['passphrase']);
const result=await createNativeRecoveryBundle({source:plan.snapshot,output:plan.output,provenance:plan.provenance,passphrase:input.passphrase});
await writeFile(plan.output+'.verification.json',JSON.stringify({...result,writePauseEvidence:plan.writePauseEvidence,restoreVerified:false,activationAllowed:false},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({packageId:result.packageId,archiveSha256:result.archiveSha256,files:result.files,bytes:result.bytes,restoreVerified:false,activationAllowed:false}));
