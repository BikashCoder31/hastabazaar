import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

/** Real Worker/D1/R2 APIs, entirely disposable: no persisted bindings or retained files. */
void test('portable source and strong package encryption work in the actual Worker runtime', async () => {
  const bundle = await build({
    stdin: {
      contents: `
  import {createSqlTransferSource} from './lib/portability/d1-source';
  import {preparePortableTransfer,inspectPortableTransfer,exportKeyRecovery,inspectKeyRecovery} from './lib/portability/transfer';
  import {createHash} from 'node:crypto';
  import {decryptPortableFrames} from './lib/portability/crypto';
  import {homepageHeroApplicationMedia} from './lib/portability/application-media';
  export default {async fetch(request,env){let stage='key-recovery',lastQuery='',mediaTypes=[];try{
   if(new URL(request.url).pathname==='/key'){
    const key=Buffer.alloc(32,7),id=createHash('sha256').update(key).digest('hex').slice(0,32);
    const bytes=await exportKeyRecovery({version:1,activeKeyId:id,keys:[{id,keyBase64:key.toString('base64')}]},'fictional-worker-recovery-passphrase');
    const result=await inspectKeyRecovery(bytes,'fictional-worker-recovery-passphrase');
    return Response.json({valid:result.keys.length===1});
   }
   stage='source';
   const db={prepare(sql){lastQuery=sql;return env.DB.prepare(sql);}};
   const describe=object=>Object.entries(object?.httpMetadata??{}).map(([key,value])=>({key,type:typeof value,isDate:value instanceof Date}));
   const bucket={async list(options){const result=await env.MEDIA.list(options);mediaTypes.push({list:result.objects.map(describe)});return result;},async get(key){const result=await env.MEDIA.get(key);mediaTypes.push({get:describe(result)});return result;}};
   const applicationMedia=await homepageHeroApplicationMedia(db,'https://fixture.test',async(url,init)=>{
    if(init.redirect!=='manual'||new URL(url).origin!=='https://fixture.test')throw Error('Unsafe fixture static read');
    const bytes=env.STATIC_ASSETS[new URL(url).pathname];if(!bytes)throw Error('Unregistered fixture path');
    return new Response(Buffer.from(bytes,'base64'),{headers:{'content-type':'image/webp'}});
   });
   const source=createSqlTransferSource(db,bucket,{installationId:'worker-fixture',release:'fictional',keyIds:[],tableClassifications:{fixture_records:'durable'},applicationMedia});
   const chunks=[];for await(const chunk of preparePortableTransfer(source,{passphrase:'fictional-worker-data-passphrase'}))chunks.push(chunk);
   stage='inspection';const result=await inspectPortableTransfer(Buffer.concat(chunks),'fictional-worker-data-passphrase');
   const objects=[],fixtureRecords=[];let table='';
   for await(const {value} of decryptPortableFrames(Buffer.concat(chunks),'fictional-worker-data-passphrase','data')){
    if(value.type==='object-start')objects.push(value.object);
    if(value.type==='table-start')table=value.name;
    if(value.type==='rows'&&table==='fixture_records')fixtureRecords.push(...value.rows);
   }
   return Response.json({valid:true,tables:result.inventory.tables.length,rows:result.totalRows,files:result.totalObjects,providerManagedTables:result.inventory.providerManagedTables,objects,fixtureRecords});
  }catch(error){return Response.json({stage,error:error.message,lastQuery,mediaTypes},{status:500});}}};
 `,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'neutral',
    format: 'esm',
    external: ['node:*', 'cloudflare:workers'],
    target: 'es2022',
  });
  const staticAssets: Record<string, string> = {};
  for (const name of [
    'nepal-craft-hero',
    'maker-hands-hero',
    'meaningful-gifts-hero',
  ])
    staticAssets['/homepage/' + name + '.webp'] = Buffer.from(
      await readFile(
        new URL('../public/homepage/' + name + '.webp', import.meta.url),
      ),
    ).toString('base64');
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: randomUUID() },
      r2Buckets: { MEDIA: randomUUID() },
      bindings: { STATIC_ASSETS: staticAssets },
    }),
  );
  try {
    const db = await mf.getD1Database('DB');
    // All actual schema definitions run ONLY against this random, disposable binding.
    for (const name of (await readdir(new URL('../drizzle/', import.meta.url)))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(
        new URL('../drizzle/' + name, import.meta.url),
        'utf8',
      );
      const statements = sql
        .split('--> statement-breakpoint')
        .map((value) => value.trim())
        .filter((value) =>
          value
            .split(/\r?\n/)
            .some((line) => line.trim() && !line.trim().startsWith('--')),
        );
      let pending: string[] = [];
      const flush = async () => {
        if (pending.length) {
          const batch = pending;
          pending = [];
          await db.batch(batch.map((sql) => db.prepare(sql)));
        }
      };
      for (const statement of statements) {
        if (/^\s*(?:--[^\n]*\n\s*)*PRAGMA\b/i.test(statement)) {
          await flush();
          await db.prepare(statement).run();
        } else {
          pending.push(statement);
          if (pending.length === 100) await flush();
        }
      }
      await flush();
    }
    await db
      .prepare(
        'CREATE TABLE fixture_records(id TEXT PRIMARY KEY,commission_bps INTEGER,maker_bps INTEGER,total INTEGER GENERATED ALWAYS AS (commission_bps+maker_bps) VIRTUAL)',
      )
      .run();
    await db
      .prepare(
        "INSERT INTO fixture_records(id,commission_bps,maker_bps) VALUES ('old',900,9100),('new',1200,8800)",
      )
      .run();
    const media = await mf.getR2Bucket('MEDIA');
    await media.put('private/fixture.bin', new Uint8Array([1, 2, 3]), {
      httpMetadata: {
        contentType: 'application/octet-stream',
        cacheExpiry: new Date('2027-01-01T00:00:00Z'),
      },
    });
    for (const route of ['/key', '/source']) {
      const response = await mf.dispatchFetch('http://fixture.test' + route),
        data = (await response.json()) as {
          valid: boolean;
          tables?: number;
          rows?: number;
          files?: number;
          providerManagedTables?: unknown;
          objects?: { key: string; httpMetadata: Record<string, string> }[];
          fixtureRecords?: { type: string; value?: string }[][];
        };
      assert.equal(response.status, 200, JSON.stringify(data));
      assert.equal(data.valid, true);
      if (route === '/source') {
        assert.equal(data.files, 4);
        assert.ok(data.rows! >= 2);
        assert.ok(data.tables! > 140);
        assert.deepEqual(data.providerManagedTables, [
          { name: '_cf_METADATA', reason: 'provider-internal' },
        ]);
        assert.deepEqual(
          data.objects?.find((object) => object.key === 'private/fixture.bin')
            ?.httpMetadata,
          {
            contentType: 'application/octet-stream',
            cacheExpiry: '2027-01-01T00:00:00.000Z',
          },
        );
        assert.deepEqual(
          data.fixtureRecords?.map((row) => row.map((value) => value.value)),
          [
            ['new', '1200', '8800', '10000'],
            ['old', '900', '9100', '10000'],
          ],
        );
      }
    }
  } finally {
    await mf.dispose();
  }
});
