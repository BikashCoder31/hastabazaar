import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,mkdir,opendir,realpath,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
import {MEDIA_REFERENCE_COLUMNS,MEDIA_REFERENCE_WITHOUT_OBJECT} from '../../lib/portability/media-reference-policy.mjs';
import {nativeIdentifier} from './native-inventory.mjs';
import {readOwned} from './registration-media.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const sidecar='.metadata.json';
const maxRows=4096,maxKeyBytes=1000;
const maxControlBytes=4096;
const maxFeeBodyBytes=4096; // Selected writer's passive PDF fixture bound.
const collation='utf8mb4_unicode_ci';
const freeProbes=['private/recovery/fictional-proof.bin','public/recovery/fictional-image.webp'];
const keyLengths={
  rider_applications:500,seller_application_draft_uploads:255,product_intake_media:512,
  manual_payment_claim_files:255,homepage_hero_media:512,
};
// [SQL type, declared character length when applicable, nullable].
const id=['varchar',191],longtext=['longtext'],bigint=['bigint'],nullableBigint=['bigint',null,true];
const support={
  seller_application_draft_uploads:{status:['varchar',16]},
  product_intake_media:{state:id,completed_at:nullableBigint},
  finance_evidence_intents:{id},
  finance_evidence_files:{id},
  managed_clearance_evidence_intents:{id,seller_id:id,uploaded_by:id,request_id:id,material_scope_digest:id,
    size_bytes:bigint,content_hash:id,mime_type:longtext,original_name:longtext},
  managed_clearance_evidence_files:{id,retained_at:bigint},
  seller_documents:{id,seller_id:id,kind:id,original_name:longtext,mime_type:longtext,size_bytes:bigint},
  seller_profiles:{id,user_id:id},
  homepage_hero_media:{id,original_name:['varchar',255],mime_type:['varchar',32],size_bytes:bigint,
    width:bigint,height:bigint,duration_seconds:['double',null,true],created_by:['varchar',191,true],
    created_at:bigint,archived_at:nullableBigint},
};
const retainedFileTables=new Map([
  ['finance_evidence_intents','finance_evidence_files'],
  ['managed_clearance_evidence_intents','managed_clearance_evidence_files'],
]);

async function rowsFor(connection,sql,values,names,maximum){
  const [rows,fields]=await connection.query(sql,values);
  assert.ok(Array.isArray(rows)&&rows.length<=maximum,'Selected media query exceeded its row bound');
  assert.deepEqual(fields.map(field=>field.name),names,'Unexpected selected media query fields');
  for(const row of rows)assert.deepEqual(Object.keys(row),names,'Unexpected selected media query row shape');
  return rows;
}

async function assertBindings(connection){
  const names=['tableName','columnName','tableType','dataType','characterSet','collationName','nullable','characters'];
  const reviewedTables=new Set([...Object.keys(MEDIA_REFERENCE_COLUMNS),...Object.keys(support)]);
  const rows=await rowsFor(connection,`
    SELECT c.TABLE_NAME tableName,c.COLUMN_NAME columnName,t.TABLE_TYPE tableType,
      c.DATA_TYPE dataType,c.CHARACTER_SET_NAME characterSet,c.COLLATION_NAME collationName,
      c.IS_NULLABLE nullable,c.CHARACTER_MAXIMUM_LENGTH characters
    FROM information_schema.COLUMNS c
    JOIN information_schema.TABLES t
      ON BINARY t.TABLE_SCHEMA=BINARY c.TABLE_SCHEMA AND BINARY t.TABLE_NAME=BINARY c.TABLE_NAME
    WHERE BINARY c.TABLE_SCHEMA=BINARY DATABASE()
      AND (LOWER(c.COLUMN_NAME)='object_key' OR RIGHT(LOWER(c.COLUMN_NAME),11)='_object_key'
        OR LOWER(c.TABLE_NAME) IN (?))
    LIMIT 8193`,[[...reviewedTables]],names,8192);
  const byName=new Map();
  for(const row of rows){
    assert.ok(!reviewedTables.has(row.tableName.toLowerCase())||reviewedTables.has(row.tableName),
      'Unexpected case in selected media table identity');
    const identity=row.tableName+'.'+row.columnName;
    assert.ok(!byName.has(identity),'Duplicate selected media column identity');
    byName.set(identity,row);
    if(/(?:^|_)object_key$/i.test(row.columnName)){
      assert.ok(Object.hasOwn(MEDIA_REFERENCE_COLUMNS,row.tableName)&&
        MEDIA_REFERENCE_COLUMNS[row.tableName].includes(row.columnName),'Unreviewed native media binding');
    }
  }
  for(const [table,columns] of Object.entries(MEDIA_REFERENCE_COLUMNS))for(const column of columns){
    const row=byName.get(table+'.'+column),legacy=table==='product_legacy_media_copies';
    const keyCollation=table==='category_media'?'utf8mb4_nopad_bin':collation;
    assert.ok(row?.tableType==='BASE TABLE'&&row.characterSet==='utf8mb4'&&row.collationName===keyCollation&&row.dataType===(legacy?'text':'varchar')&&
      (legacy||Number(row.characters)===(keyLengths[table]??191))&&row.nullable===(table==='rider_reports'?'YES':'NO'),
    'Unexpected selected media reference column');
  }
  for(const [table,columns] of Object.entries(support))for(const [column,[type,length,nullable]] of Object.entries(columns)){
    const row=byName.get(table+'.'+column);
    const text=type==='varchar'||type==='longtext';
    assert.ok(row?.tableType==='BASE TABLE'&&row.dataType===type&&row.nullable===(nullable?'YES':'NO')&&
      row.characterSet===(text?'utf8mb4':null)&&row.collationName===(text?collation:null)&&
      (type==='longtext'||(text?Number(row.characters)===length:row.characters===null)),
    'Unexpected selected media support column: '+table+'.'+column);
  }
}

function decodeKey(hex){
  assert.ok(typeof hex==='string'&&hex.length<=maxKeyBytes*2&&/^(?:[A-F0-9]{2})+$/.test(hex),'Invalid native media key bytes');
  const bytes=Buffer.from(hex,'hex');
  let key;
  try{key=utf8.decode(bytes);}catch{throw new Error('Invalid native media UTF-8');}
  assert.ok(Buffer.from(key).equals(bytes)&&/^(?:private|public)\//.test(key)&&
    !/[\\:\p{Cc}\ufeff<>"|?*]/u.test(key)&&!key.toLowerCase().endsWith(sidecar)&&
    key.split('/').every(part=>part&&!part.startsWith('.')&&!/[. ]$/.test(part)&&
      !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)&&
      Buffer.byteLength(part)<=255)&&Buffer.byteLength(key.split('/').at(-1)+sidecar)<=255,
  'Unsafe selected native media key');
  return key;
}

// A complete bounded scan uses no SQL equality, grouping or sorting on keys.
// This preserves raw case, accent and padding differences even for TEXT.
export async function readSelectedNativeMediaCensus(connection,cancellation){
  await cancellation?.checkpoint();
  await assertBindings(connection);
  const keys=new Map();
  let totalRows=0;
  for(const [table,columns] of Object.entries(MEDIA_REFERENCE_COLUMNS))for(const column of columns){
    const name='r.'+nativeIdentifier(column);
    const raw=`CASE WHEN OCTET_LENGTH(${name})<=${maxKeyBytes} THEN HEX(${name}) ELSE 'X' END`;
    const fileTable=retainedFileTables.get(table);
    const linked=fileTable&&'SELECT 1 FROM '+nativeIdentifier(fileTable)+' f WHERE f.id=r.id';
    const exactId='BINARY f.id=BINARY r.id';
    const malformed=linked?'EXISTS ('+linked+' AND NOT ('+exactId+'))':'FALSE';
    const optional=linked?'r.id IS NOT NULL AND NOT EXISTS ('+linked+' AND '+exactId+')':
      (MEDIA_REFERENCE_WITHOUT_OBJECT[table]??'FALSE').replace(/r\.(status|state)\b/g,'BINARY r.$1');
    await cancellation?.checkpoint();
    const remaining=maxRows-totalRows;
    const rows=await rowsFor(connection,`
      SELECT CONVERT(${raw} USING ascii) keyHex,CASE WHEN ${optional} THEN 0 ELSE 1 END requiredObject,
        CASE WHEN ${malformed} THEN 1 ELSE 0 END malformedLink
      FROM ${nativeIdentifier(table)} r WHERE ${name} IS NOT NULL LIMIT ${remaining+1}`,[],
    ['keyHex','requiredObject','malformedLink'],remaining);
    totalRows+=rows.length;
    for(const row of rows){
      assert.equal(row.malformedLink,0,'Selected native media has a collated-only retained evidence link');
      const key=decodeKey(row.keyHex),required=row.requiredObject;
      assert.ok(required===0||required===1,'Invalid selected media census result');
      const record=keys.get(key)??{required:false,bindings:{}};
      record.required ||= required===1;
      record.bindings[table]=(record.bindings[table]??0)+1;
      keys.set(key,record);
    }
  }
  return keys;
}

function assertPaths(keys){
  const paths=new Map();
  for(const key of keys)for(const file of [key,key+sidecar]){
    const parts=file.split('/');
    for(let i=1;i<=parts.length;i++){
      const path=parts.slice(0,i).join('/');
      const alias=path.normalize('NFKC').toUpperCase();
      const leaf=i===parts.length,previous=paths.get(alias);
      assert.ok(!previous||(!leaf&&!previous.leaf&&previous.path===path),'Colliding selected native media paths');
      paths.set(alias,{path,leaf});
    }
  }
}

export function readFeeNativeMediaHandoff(output){
  const prefix='Fee native media manifest SHA-256: ';
  const markers=output.split(/\r?\n/).filter(line=>line.includes(prefix));
  // node --test --test-reporter=tap encodes child stdout as a diagnostic line.
  assert.ok(markers.length===1&&markers[0].startsWith('# '+prefix),'Expected one fee native media TAP handoff');
  const hash=markers[0].slice(('# '+prefix).length);
  assert.ok(hashPattern.test(hash),'Invalid fee native media handoff digest');
  return hash;
}

function parseJson(bytes,message){
  try{return JSON.parse(utf8.decode(bytes));}catch{throw new Error(message);}
}

async function exactTree(root,files,cancellation){
  const directories=new Set(['']);
  for(const file of files.keys()){
    const parts=file.split('/');
    for(let index=1;index<parts.length;index++)directories.add(parts.slice(0,index).join('/'));
  }
  const expectedEntries=directories.size-1+files.size;
  let entries=0;
  async function walk(relative){
    await cancellation?.checkpoint();
    const path=resolve(root,relative);
    const entry=await lstat(path);
    assert.ok(entry.isDirectory()&&!entry.isSymbolicLink()&&await realpath(path)===path,'Unsafe fee native media directory');
    for await(const entry of await opendir(path,{bufferSize:1})){
      assert.ok(++entries<=expectedEntries,'Fee native media tree exceeds its entry bound');
      const child=relative?relative+'/'+entry.name:entry.name;
      if(entry.isDirectory()&&directories.has(child))await walk(child);
      else assert.ok(entry.isFile()&&files.has(child),'Unexpected fee native media tree entry');
    }
  }
  await walk('');
  assert.equal(entries,expectedEntries,'Fee native media tree is incomplete');
}

async function feeMedia({source,workspace,marker,archiveSha256,feeNativeMediaManifestSha256,census,cancellation}){
  const owner=parseJson(await readOwned(workspace,resolve(workspace,'ownership.json'),maxControlBytes),'Invalid fee media ownership');
  assert.ok(marker.token&&owner.name===marker.name&&owner.token===marker.token,'Fee media ownership mismatch');
  const bytes=await readOwned(workspace,resolve(workspace,'fee-native-media.json'),maxControlBytes);
  assert.ok(hashPattern.test(feeNativeMediaManifestSha256)&&sha256(bytes)===feeNativeMediaManifestSha256,
    'Fee native media manifest is unauthenticated');
  const manifest=parseJson(bytes,'Invalid fee media manifest');
  assert.ok(manifest?.version===1&&Object.keys(manifest).length===6&&manifest.producer==='native-fee-clearance-fixture-v1'&&
    manifest.containerId===marker.id&&manifest.database===marker.database&&manifest.archiveSha256===archiveSha256&&
    Array.isArray(manifest.files)&&manifest.files.length===2,'Fee native media manifest identity mismatch');
  const rows=await rowsFor(source,`
    SELECT i.id,i.object_key objectKey,i.size_bytes bytes,i.content_hash sha256,i.seller_id sellerId,
      i.material_scope_digest scopeDigest,i.mime_type mimeType,i.original_name originalName
    FROM managed_clearance_evidence_intents i
    JOIN managed_clearance_evidence_files f ON BINARY f.id=BINARY i.id
    WHERE BINARY i.request_id='fee-managed-clearance-file' AND BINARY i.uploaded_by='owner'
      AND BINARY i.seller_id='managed-fee-seller' AND f.retained_at IS NOT NULL LIMIT 2`,[],
  ['id','objectKey','bytes','sha256','sellerId','scopeDigest','mimeType','originalName'],2);
  assert.ok(rows.length===1,'Expected exactly one committed fee native media file');
  const row=rows[0],size=Number(row.bytes),key=row.objectKey;
  assert.ok(/^clearance-file-[a-f0-9]{64}$/.test(row.id)&&key==='private/managed-clearance-evidence/'+row.id&&
    census.get(key)?.required&&census.get(key)?.bindings.managed_clearance_evidence_intents===1&&
    Number.isSafeInteger(size)&&size>0&&size<=maxFeeBodyBytes&&row.sellerId==='managed-fee-seller'&&
    hashPattern.test(row.sha256)&&hashPattern.test(row.scopeDigest)&&
    row.mimeType==='application/pdf'&&row.originalName==='fictional-clearance.pdf','Invalid committed fee native media identity');
  const files=new Map();
  for(const record of manifest.files){
    assert.ok((record?.path===key||record?.path===key+sidecar)&&Object.keys(record).length===3&&!files.has(record.path)&&
      Number.isSafeInteger(record.bytes)&&record.bytes>0&&record.bytes<=(record.path===key?size:maxControlBytes)&&
      hashPattern.test(record.sha256),'Invalid fee native media manifest record');
    files.set(record.path,record);
  }
  assert.ok(files.get(key)?.bytes===size&&files.get(key)?.sha256===row.sha256,'Fee media manifest differs from committed body');
  const root=resolve(workspace,'fee-native-media');
  await exactTree(root,files,cancellation);
  const contents=new Map();
  for(const file of files.values()){
    await cancellation?.checkpoint();
    const content=await readOwned(root,resolve(root,file.path),file.bytes);
    assert.ok(content.length===file.bytes&&sha256(content)===file.sha256,'Fee native media bytes differ from handoff');
    contents.set(file.path,content);
  }
  const metadata=parseJson(contents.get(key+sidecar),'Invalid fee native media metadata');
  assert.ok(metadata?.size===size&&metadata.etag===row.sha256&&
    typeof metadata.uploaded==='string'&&Number.isFinite(Date.parse(metadata.uploaded)),
  'Fee native media metadata body binding mismatch');
  assert.ok(metadata.httpMetadata&&Object.keys(metadata.httpMetadata).length===1&&
    metadata.httpMetadata.contentType===row.mimeType,'Fee native media HTTP metadata differs');
  const custom=metadata.customMetadata;
  assert.ok(custom&&Object.keys(custom).length===3&&custom.sellerId===row.sellerId&&
    custom.contentHash===row.sha256&&custom.materialScopeDigest===row.scopeDigest,'Fee native media custom metadata differs');
  return {key,contents};
}

const rowOnlyDocuments=[
  ['seller-a','user-a','native-registered-document-0','business_registration','source-0','fictional-source.pdf'],
  ['seller-a','user-a','native-registered-document-1','pan_certificate','source-1','fictional-source.pdf'],
  ['seller-a','user-a','native-registered-document-2','representative_identity','source-2','fictional-source.pdf'],
  ['managed-fee-seller','managed-fee-owner','fee-managed-document-0','pan_certificate','source-0','fictional-source.pdf'],
  ['managed-fee-seller','managed-fee-owner','managed-id','representative_identity','source-1','fictional-source.pdf'],
  ['managed-fee-seller','managed-fee-owner','fee-managed-bank','bank_verification','fee-managed-bank','fictional-bank.pdf'],
];

function exclusively(census,key,table){
  const row=census.get(key);
  return row?.required&&Object.keys(row.bindings).length===1&&row.bindings[table]===1;
}

async function rowOnlyKeys(source,census,cancellation){
  const accepted=[];
  for(const [sellerId,ownerId,id,kind,leaf,name] of rowOnlyDocuments){
    await cancellation?.checkpoint();
    const key='private/seller-documents/'+sellerId+'/'+leaf;
    assert.ok(exclusively(census,key,'seller_documents'),'Missing, optional or shared selected row-only document reference');
    const rows=await rowsFor(source,`
      SELECT d.id,d.seller_id sellerId,p.user_id ownerId,d.kind,d.object_key objectKey,
        d.original_name originalName,d.mime_type mimeType,d.size_bytes bytes
      FROM seller_documents d JOIN seller_profiles p ON BINARY p.id=BINARY d.seller_id
      WHERE BINARY d.id=BINARY ? AND BINARY d.object_key=BINARY ? LIMIT 2`,[id,key],
    ['id','sellerId','ownerId','kind','objectKey','originalName','mimeType','bytes'],2);
    const row=rows[0];
    assert.ok(rows.length===1&&row.id===id&&row.sellerId===sellerId&&row.ownerId===ownerId&&row.kind===kind&&
      row.objectKey===key&&row.originalName===name&&row.mimeType==='application/pdf'&&Number(row.bytes)===100,
    'Row-only seller document does not match its selected fixture identity');
    accepted.push(key);
  }
  return accepted;
}

const homepage=[
  ['nepal-craft',320794,'2e5d7d45798fc6b7a4ad809a536084f93cd403609531a393a291f2b7554ffc4b'],
  ['maker-hands',209526,'75f407158e256bd6310b474780e5cca16f7f5b58e3e79793cc529a5727563da3'],
  ['meaningful-gifts',233764,'f3fa602d48c1743d79256f7db16a401c0906ea0f1733a794d6fc5fed680d05c2'],
];

async function builtInMedia({source,census,packageRoot,releaseFiles,cancellation}){
  const objects=new Map();
  for(const [stem,size,hash] of homepage){
    await cancellation?.checkpoint();
    const name=stem+'-hero.webp',key='public/homepage/'+name,id='system-'+stem+'-hero';
    assert.ok(exclusively(census,key,'homepage_hero_media'),'Missing or shared selected built-in homepage reference');
    const rows=await rowsFor(source,`
      SELECT id,object_key objectKey,original_name originalName,mime_type mimeType,size_bytes bytes,width,height,
        duration_seconds duration,created_by creator,created_at created,archived_at archived
      FROM homepage_hero_media WHERE BINARY id=BINARY ? LIMIT 2`,[id],
    ['id','objectKey','originalName','mimeType','bytes','width','height','duration','creator','created','archived'],2);
    const row=rows[0];
    assert.ok(rows.length===1&&row.id===id&&row.objectKey===key&&row.originalName===name&&row.mimeType==='image/webp'&&
      Number(row.bytes)===size&&Number(row.width)===1800&&Number(row.height)===1125&&row.duration===null&&
      row.creator===null&&row.created!==null&&Number(row.created)===0&&row.archived===null,'Built-in homepage reference differs');
    const paths=new Set([key,'dist/client/homepage/'+name]);
    const inventory=releaseFiles.filter(file=>paths.has(file.path));
    assert.ok(inventory.length>0,'Admitted package lacks the built-in homepage asset');
    for(const file of inventory){
      assert.ok(file.bytes===size&&file.sha256===hash,'Built-in homepage asset inventory differs from the reviewed bytes');
      const body=await readOwned(packageRoot,resolve(packageRoot,file.path),size);
      assert.ok(body.length===size&&sha256(body)===hash,'Built-in homepage asset bytes differ');
      objects.set(key,body);
    }
  }
  return objects;
}

function generatedMetadata(key,body,fixture,contentType){
  return Buffer.from(JSON.stringify({
    httpMetadata:{contentType,cacheControl:key.startsWith('private/')?'private, no-store':'public, max-age=600'},
    customMetadata:{fixture},size:body.length,etag:sha256(body),uploaded:'2026-10-21T00:00:00.000Z',
  }));
}

/** The existing registration proof is independently planned and staged by its caller. */
export async function planSelectedNativeMedia(options){
  const {source,workspace,marker,census,registrationKeys,cancellation}=options;
  await cancellation?.checkpoint();
  assert.ok(/^[a-f0-9]{64}$/.test(marker.id)&&workspace===resolve(workspace)&&
    /^\.test-artifacts\/t35\/current-artifact-native-\d+\/\d+$/.test(relative(process.cwd(),workspace)),
    'Selected native media requires the owned Linux fixture workspace');
  assert.ok(freeProbes.every(key=>!census.has(key)),'Free-standing media probe unexpectedly referenced');
  assertPaths([...census.keys(),...freeProbes]);
  for(const key of registrationKeys)assert.ok(census.has(key),'Registration upload missing from selected census');
  const fee=await feeMedia(options);
  const rowOnly=await rowOnlyKeys(source,census,cancellation);
  const builtIn=await builtInMedia(options);
  const contents=fee.contents;
  const supplied=new Set([...registrationKeys,fee.key,...rowOnly,...builtIn.keys()]);
  assert.ok(supplied.size===registrationKeys.size+1+rowOnly.length+builtIn.size,'Overlapping selected media provenance');
  for(const [key,reference] of census){
    if(reference.required)assert.ok(supplied.has(key),'Required selected media lacks authenticated or explicitly classified fixture bytes');
  }
  for(const [key,body] of builtIn){
    contents.set(key,body);
    contents.set(key+sidecar,generatedMetadata(key,body,'selected-package-homepage','image/webp'));
  }
  for(const key of [...rowOnly,...freeProbes]){
    const placeholder=Buffer.from('Fictional native recovery fixture\0'+key);
    const body=rowOnly.includes(key)?Buffer.alloc(100):placeholder;
    if(body!==placeholder)assert.equal(placeholder.copy(body),placeholder.length);
    contents.set(key,body);
    contents.set(key+sidecar,generatedMetadata(key,body,'native-recovery','application/octet-stream'));
  }
  const requiredMediaReferences=[...census.values()].filter(reference=>reference.required).length;
  return {contents,mediaObjects:supplied.size+freeProbes.length,summary:{
    requiredMediaReferences,optionalOnlyMediaReferences:census.size-requiredMediaReferences,
    omittedOptionalMediaReferences:[...census.keys()].filter(key=>!supplied.has(key)).length,
    syntheticReferencedMediaObjects:rowOnly.length,syntheticFreeProbeObjects:freeProbes.length,
    packagedHomepageMediaObjects:builtIn.size,feeClearanceMediaObjects:1,
    feeClearanceMediaManifestSha256:options.feeNativeMediaManifestSha256,
  }};
}

export async function stageSelectedNativeMedia(snapshot,media,cancellation){
  for(const [file,bytes] of media.contents){
    await cancellation?.checkpoint();
    const target=resolve(snapshot,'media',file);
    await mkdir(dirname(target),{recursive:true,mode:0o700});
    await writeFile(target,bytes,{flag:'wx',mode:0o600});
    assert.ok(sha256(await readOwned(snapshot,target,bytes.length))===sha256(bytes),'Selected native media copy differs');
  }
}

export async function verifyRestoredSelectedNativeMedia(target,media,cancellation){
  for(const [file,bytes] of media.contents){
    await cancellation?.checkpoint();
    const restored=await readOwned(target,resolve(target,'media',file),bytes.length);
    assert.ok(restored.length===bytes.length&&sha256(restored)===sha256(bytes),'Restored selected native media differs');
  }
}
