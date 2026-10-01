import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const runtimeTest = new URL('./mariadb-release-runtime.test.ts', import.meta.url).href;
const tsxLoader = import.meta.resolve('tsx');
const mysqlModule = import.meta.resolve('mysql2/promise');

// Run the actual directly executable test module. External filesystem/Docker
// boundaries use fictional metadata; the actual DB creation boundary throws
// before any socket or write. This proves guard ordering without a live fixture.
function importRuntime(changes: Record<string, unknown> = {}, cwd = project) {
  const code = `
    import fs from 'node:fs/promises';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    import mysql from ${JSON.stringify(mysqlModule)};
    const changes = ${JSON.stringify(changes)};
    const fixture = {name:'hastabazaar-release-readiness-20261001',id:'fictional-container-id',host:'127.0.0.1',port:13328,user:'root',password:'fictional-guard-only'};
    const realReadFile = fs.readFile;
    fs.readFile = async (path,...args) => String(path).endsWith('/.env.mariadb-release-private.json') || String(path).endsWith('\\\\.env.mariadb-release-private.json')
      ? JSON.stringify(fixture) : realReadFile(path,...args);
    childProcess.execFileSync = (command,args) => {
      if(command !== 'docker') throw new Error('Unexpected external command');
      if(args.join(' ') === 'context inspect') return JSON.stringify([{Endpoints:{docker:{Host:changes.endpoint ?? 'npipe:////./pipe/fictional-local'}}}]);
      if(args.join(' ') === 'inspect '+fixture.name) return JSON.stringify([{
        Id:changes.id ?? fixture.id,State:{Running:changes.running ?? true},
        Config:{Image:changes.image ?? 'mariadb:10.11',Labels:{'codex.task':changes.task ?? 'local-audit-remediation','codex.scope':changes.scope ?? 'mariadb-release-readiness'}},
        HostConfig:{PortBindings:{'3306/tcp':[{HostIp:changes.hostIp ?? '127.0.0.1',HostPort:'13328'}]}}
      }]);
      throw new Error('Unexpected Docker operation');
    };
    syncBuiltinESMExports();
    Object.assign(process.env,{HATSKALA_MARIADB_RELEASE:'1',HASTABAZAAR_RUNTIME_ENV:'local_staging',DB_HOST:'127.0.0.1',DB_PORT:'13328',DB_NAME:'release_0_fresh',DB_USER:changes.user ?? 'root',DB_PASSWORD:fixture.password});
    let connectionCalls=0,poolCalls=0,options;
    const poolFactory = mysql.createPool = () => {poolCalls++;throw new Error('Pool creation intercepted');};
    mysql.createConnection = async input => {connectionCalls++;options=input;throw new Error('Connection intercepted before socket');};
    let error;
    try {await import(${JSON.stringify(runtimeTest)});} catch(failure) {error=failure;}
    console.log(JSON.stringify({connectionCalls,poolCalls,poolReplaced:mysql.createPool!==poolFactory,
      guardRejected:error?.code==='ERR_ASSERTION',intercepted:error?.message==='Connection intercepted before socket',
      options:options ? {host:options.host,port:options.port,database:options.database,user:options.user,passwordMatches:options.password===fixture.password}:null}));
  `;
  const output = execFileSync(process.execPath, ['--import', tsxLoader, '--input-type=module', '--eval', code], {cwd, encoding: 'utf8', timeout: 15000});
  return JSON.parse(output.trim());
}

for (const [label, changes, cwd] of [
  ['arbitrary adapter user', {user: 'arbitrary_fixture_user'}, project],
  ['remote Docker context', {endpoint: 'tcp://example.invalid:2375'}, project],
  ['different container identity', {id: 'another-fictional-container'}, project],
  ['stopped container', {running: false}, project],
  ['different task label', {task: 'another-task'}, project],
  ['different scope label', {scope: 'another-scope'}, project],
  ['different image', {image: 'mariadb:10.6'}, project],
  ['nonloopback published port', {hostIp: '0.0.0.0'}, project],
  ['different checkout cwd', {}, tmpdir()],
] as const) {
  void test(`direct runtime test rejects ${label} before pool or connection setup`, () => {
    const result = importRuntime(changes, cwd);
    assert.equal(result.guardRejected, true);
    assert.equal(result.connectionCalls, 0);
    assert.equal(result.poolCalls, 0);
    assert.equal(result.poolReplaced, false);
  });
}

void test('direct runtime test uses the validated fixture options after every scope check succeeds', () => {
  const result = importRuntime();
  assert.equal(result.guardRejected, false);
  assert.equal(result.intercepted, true);
  assert.equal(result.connectionCalls, 1);
  assert.deepEqual(result.options, {host: '127.0.0.1', port: 13328, database: 'release_0_fresh', user: 'root', passwordMatches: true});
});
