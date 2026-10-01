import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

const folder = resolve(process.argv[2]);
const identity = JSON.parse(await readFile(resolve(folder, 'inventory.json'), 'utf8'));
assert.match(identity.release, /^hastabazaar-release-[a-z0-9._-]{1,100}$/);
assert.equal(identity.archive, `${identity.release}.tar.gz`);
assert.ok(process.env.STAGING_KEY_FILE && process.env.STAGING_KNOWN_HOSTS);
const ssh = spawn(process.env.SSH_BIN ?? 'ssh', ['-T', '-i', process.env.STAGING_KEY_FILE,
  '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
  '-o', `UserKnownHostsFile=${process.env.STAGING_KNOWN_HOSTS}`, '-o', 'ConnectTimeout=20',
  'hastabaz@fishtail.mysecurecloudserver.com', 'deploy-staging-v1'], { stdio: ['pipe', 'inherit', 'inherit'] });
const exited = once(ssh, 'exit');
ssh.stdin.write(JSON.stringify(identity) + '\n');
await pipeline(createReadStream(resolve(folder, identity.archive)), ssh.stdin);
const [code] = await exited;
assert.equal(code, 0, 'Staging deployment did not succeed.');
