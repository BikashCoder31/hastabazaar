import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
assert.equal(resolve(process.cwd()), project, 'Run only from this script\'s checkout.');
const require = createRequire(resolve(project, 'package.json'));
const mysql = require('mysql2/promise');
const containerName = `hastabazaar-feedback-qa-${randomUUID()}`;
const password = randomBytes(24).toString('hex');
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const context = JSON.parse(docker(['context', 'inspect']))[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const pools = [];
const createPool = mysql.createPool;
let connection;
let containerId;

function sqlStatements(sql) {
  let delimiter = ';', buffer = '';
  const result = [];
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.ok(!buffer.trim() || buffer.trim().split('\n').every((part) => !part.trim() || part.trim().startsWith('--')));
      delimiter = directive[1];
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      result.push(buffer.trimEnd().slice(0, -delimiter.length));
      buffer = '';
    }
  }
  assert.ok(!buffer.trim() || buffer.trim().split('\n').every((part) => !part.trim() || part.trim().startsWith('--')));
  return result.filter((statement) => statement.trim());
}

try {
  containerId = docker(['run', '--detach', '--pull', 'never', '--name', containerName,
    '--label', 'codex.scope=fictional-feedback-regression', '--publish', '127.0.0.1::3306',
    '--env', `MARIADB_ROOT_PASSWORD=${password}`, 'mariadb:10.11']).trim();
  const container = JSON.parse(docker(['inspect', containerId]))[0];
  assert.equal(container.Id, containerId);
  assert.equal(container.Config.Image, 'mariadb:10.11');
  assert.equal(container.Config.Labels['codex.scope'], 'fictional-feedback-regression');
  const ports = container.NetworkSettings.Ports['3306/tcp'];
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, '127.0.0.1');
  const port = Number(ports[0].HostPort);
  const deadline = Date.now() + 60000;
  while (!connection) {
    try { connection = await mysql.createConnection({host: '127.0.0.1', port, user: 'root', password}); }
    catch {
      if (Date.now() >= deadline) throw new Error('Disposable MariaDB fixture did not become ready.');
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  const database = 'fictional_feedback_qa';
  await connection.query(`CREATE DATABASE ${database}`);
  await connection.query(`USE ${database}`);
  for (const statement of sqlStatements(await readFile(resolve(project, 'deployment/babal/mariadb-schema.sql'), 'utf8')))
    await connection.query(statement);
  for (const sql of [
    "INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('qa-super','qa-super@example.test','Fictional QA Super','active',1,1),('qa-admin','qa-admin@example.test','Fictional QA Admin','active',1,1),('qa-buyer','qa-buyer@example.test','Fictional QA Buyer','active',1,1)",
    "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('qa-super','super_admin',1),('qa-admin','admin',1),('qa-buyer','customer',1)",
    "INSERT INTO staff_permission_profiles(user_id,permissions_json,updated_by,updated_at) VALUES ('qa-admin','[\"support.manage\"]','qa-super',1)",
    "INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES ('qa-version','public.contact',1,1,'published','{\"formId\":\"public.contact\",\"fields\":[]}','Fictional local QA','qa-super',1,'qa-super',1,'qa-super',1,'qa-publication')",
    "INSERT INTO feedback_delivery_jobs(id,form_id,request_id,config_version_id,payload_hash,feedback_json,status,lease_token,lease_expires_at,attempt_count,created_at,updated_at) VALUES ('qa-job','public.contact','qa-request','qa-version',REPEAT('a',64),'{}','sending','qa-lease',100,1,1,1)",
    "INSERT INTO form_answer_sets(id,subject_type,subject_id,form_id,request_id,config_version_id,answers_json,created_at) VALUES ('qa-answer','feedback_submission','qa-job','public.contact','qa-request','qa-version','{\"formId\":\"public.contact\",\"version\":1,\"answers\":[]}',1)",
  ]) await connection.query(sql);
  Object.assign(process.env, {DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: database,
    DB_USER: 'root', DB_PASSWORD: password, HASTABAZAAR_RUNTIME_ENV: 'local_staging'});
  mysql.createPool = (...args) => { const pool = createPool(...args); pools.push(pool); return pool; };
  const {env} = await import(pathToFileURL(resolve(project, 'lib/runtime/node-bindings.ts')).href);
  const {authorizeFormAnswerRead} = await import(pathToFileURL(resolve(project, 'lib/forms/access.ts')).href);
  const answer = {id: 'qa-answer', formId: 'public.contact', subjectType: 'feedback_submission',
    subjectId: 'qa-job', requestId: 'qa-request', actorId: null};
  const admin = {id: 'qa-admin', role: 'admin', permissions: ['support.manage']};
  assert.equal(await authorizeFormAnswerRead(env.DB, {id: 'qa-super', role: 'super_admin'}, answer), true);
  assert.equal(await authorizeFormAnswerRead(env.DB, admin, answer), true);
  for (const grants of ['[]', 'invalid-json', '{}', '["support.manage",1]',
    '["support.manage","admin.invite"]', '["support.manage","unknown"]']) {
    await connection.execute('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?', [grants, admin.id]);
    assert.equal(await authorizeFormAnswerRead(env.DB, admin, answer), false, grants);
  }
  await connection.execute('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?', ['["support.manage"]', admin.id]);
  for (const status of ['pending', 'leased', 'sending', 'failed', 'sent']) {
    await connection.execute("UPDATE feedback_delivery_jobs SET status=?,lease_token=IF(? IN ('leased','sending'),'qa-lease',NULL),lease_expires_at=IF(? IN ('leased','sending'),100,NULL),sent_at=IF(?='sent',2,NULL) WHERE id=?", [status,status,status,status,answer.subjectId]);
    assert.equal(await authorizeFormAnswerRead(env.DB, admin, answer), true, status);
  }
  for (const changed of [{id: 'another-answer'}, {requestId: 'another-request'},
    {subjectId: 'another-job'}, {formId: 'public.feedback'}]) {
    assert.equal(await authorizeFormAnswerRead(env.DB, admin, {...answer, ...changed}), false);
  }
  assert.equal(await authorizeFormAnswerRead(env.DB, {id:'qa-buyer',role:'customer'}, answer), false);
  await connection.execute("UPDATE users SET status='suspended' WHERE id='qa-admin'");
  assert.equal(await authorizeFormAnswerRead(env.DB, admin, answer), false);
  await connection.execute("UPDATE users SET status='active' WHERE id='qa-admin'");
  await connection.execute("DELETE FROM staff_permission_profiles WHERE user_id='qa-admin'");
  assert.equal(await authorizeFormAnswerRead(env.DB, admin, answer), true);
  console.log(JSON.stringify({result: 'PASS', engine: 'MariaDB 10.11', scope: 'new disposable fictional fixture with canonical bootstrap schema and actual runtime adapter', checks: 20, productionAccess: false}));
} catch (error) {
  console.log(JSON.stringify({result: 'FAIL', code: error.code ?? error.name,
    message: String(error.message).replaceAll(password, '[redacted]').slice(0, 500), productionAccess: false}));
  process.exitCode = 1;
} finally {
  mysql.createPool = createPool;
  await connection?.end();
  for (const pool of pools) await pool.end();
  if (containerId) {
    const container = JSON.parse(docker(['inspect', containerId]))[0];
    assert.equal(container.Name, '/' + containerName);
    assert.equal(container.Config.Labels['codex.scope'], 'fictional-feedback-regression');
    docker(['rm', '--force', '--volumes', containerId]);
  }
}
