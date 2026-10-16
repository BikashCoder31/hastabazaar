import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function stagingNativeFixture() {
  assert.equal(process.env.HATSKALA_STAGING_NATIVE,'1');
  const project=fileURLToPath(new URL('../../',import.meta.url));
  assert.equal(resolve(process.cwd()),resolve(project));
  const workspace=resolve(project,'.superpowers/sdd/2026-10-16-staging-native-compatibility');
  const path=resolve(process.env.HATSKALA_NATIVE_MARKER??'missing');
  assert.ok(path.startsWith(workspace+sep));
  assert.match(path.slice(workspace.length+1),/^\.native-\d+\.json$/);
  const marker=JSON.parse(await readFile(path,'utf8'));
  assert.equal(process.env.HATSKALA_NATIVE_TOKEN,marker.token);
  assert.equal(marker.host,'127.0.0.1');assert.equal(marker.port,13329);
  assert.match(marker.name,/^hastabazaar-native-\d+$/);
  assert.match(marker.database,/^native_\d+_fresh$/);
  assert.equal(marker.database.replace(/^native_|_fresh$/g,''),marker.name.replace('hastabazaar-native-',''));
  assert.equal(process.env.DB_HOST,marker.host);assert.equal(process.env.DB_PORT,'13329');
  assert.equal(process.env.DB_NAME,marker.database);assert.equal(process.env.DB_USER,'root');assert.equal(process.env.DB_PASSWORD,marker.password);
  const docker=process.platform==='win32'?'C:/Program Files/Docker/Docker/resources/bin/docker.exe':'docker';
  const context=JSON.parse(execFileSync(docker,['context','inspect'],{encoding:'utf8'}))[0];
  assert.match(context.Endpoints.docker.Host,/^(npipe|unix):\/\//);
  const container=JSON.parse(execFileSync(docker,['inspect',marker.name],{encoding:'utf8'}))[0];
  assert.equal(container.Id,marker.id);assert.equal(container.State.Running,true);
  assert.equal(container.Config.Image,'mariadb:10.11');assert.equal(container.Config.Labels['codex.scope'],'staging-native-compatibility');
  assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'],[{HostIp:'127.0.0.1',HostPort:'13329'}]);
  assert.equal(container.Mounts.some((m:{Type:string})=>m.Type==='bind'),false);
  return {host:marker.host,port:marker.port,user:'root',password:marker.password,database:marker.database};
}
