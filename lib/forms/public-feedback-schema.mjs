import {createHash} from 'node:crypto';

/** Derive all native guards from 0154; never maintain a weaker second policy. */
export function generatePublicFeedbackMariaSql(source) {
  const hash=createHash('sha256').update(source).digest('hex');
  const triggers=[...source.matchAll(/CREATE TRIGGER (feedback_native_\w+) BEFORE (INSERT|UPDATE|DELETE) ON (feedback_delivery_jobs|audit_logs)\s+WHEN ([\s\S]+?)\s+BEGIN\s+([\s\S]+?)\nEND;/g)];
  if(triggers.length!==5||!source.includes('config_version_id TEXT,')||!source.includes('FOREIGN KEY(form_id,config_version_id) REFERENCES form_config_versions(form_id,id) ON DELETE RESTRICT'))throw Error('Unreviewed public feedback migration shape.');
  if(!source.includes("json_type(feedback_json)='object'"))throw Error('Unreviewed public feedback JSON shape.');
  if(triggers.map(([,name,event,table])=>`${name}:${event}:${table}`).join('|')!=='feedback_native_origin_insert:INSERT:feedback_delivery_jobs|feedback_native_origin_update:UPDATE:feedback_delivery_jobs|feedback_native_facts_immutable:UPDATE:feedback_delivery_jobs|feedback_native_proof_immutable:UPDATE:audit_logs|feedback_native_proof_retained:DELETE:audit_logs')throw Error('Unreviewed public feedback guard inventory.');
  const native=value=>{
    const converted=value
      .replaceAll("json_array_length(json_extract(receipt.next_json,'$.answers'))","JSON_LENGTH(JSON_EXTRACT(receipt.next_json,'$.answers'))")
      .replaceAll("json_type(receipt.next_json,'$.answers')='array'","JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.answers'))='ARRAY'")
      .replaceAll("json_type(receipt.next_json,'$.version')='integer'","JSON_TYPE(JSON_EXTRACT(receipt.next_json,'$.version'))='INTEGER'")
      .replace(/json_extract\((\w+\.next_json),'([^']+)'\)/g,"JSON_VALUE($1,'$2')")
      .replaceAll("'feedback:'||NEW.id||':submitted'","CONCAT('feedback:',NEW.id,':submitted')")
      .replaceAll("'core:'||NEW.form_id||':1'","CONCAT('core:',NEW.form_id,':1')")
      .replace(/NEW\.(\w+) IS NOT OLD\.\1/g,'NOT (HEX(NEW.$1) <=> HEX(OLD.$1))');
    if(/json_extract|json_type|json_array_length|\|\||IS NOT OLD|RAISE\(/.test(converted))throw Error('Unconverted public feedback native guard.');
    return converted;
  };
  const definitions=triggers.map(([,name,event,table,when,body])=>{
    const proof=body.match(/^SELECT CASE WHEN ([\s\S]+) THEN RAISE\(ABORT,'([^']+)'\) END;$/);
    const failure=body.match(/^SELECT RAISE\(ABORT,'([^']+)'\);$/);
    if(!proof&&!failure)throw Error('Unreviewed public feedback trigger body.');
    const command=proof?`IF ${native(proof[1])} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${proof[2]}'; END IF;`:`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${failure[1]}';`;
    return `CREATE TRIGGER \`${name}\` BEFORE ${event} ON \`${table}\` FOR EACH ROW\nBEGIN\n  IF ${native(when)} THEN\n    ${command}\n  END IF;\nEND$$`;
  });
  return `-- Source: drizzle/0154_native_public_feedback_defaults.sql SHA256 ${hash}\n-- Preserve the original composite FK, indexes, checks and every existing delivery row.\nALTER TABLE \`feedback_delivery_jobs\` MODIFY COLUMN \`config_version_id\` VARCHAR(191) COLLATE utf8mb4_nopad_bin NULL;\nALTER TABLE \`feedback_delivery_jobs\` ADD CONSTRAINT \`feedback_delivery_jobs_native_json_object\` CHECK (JSON_TYPE(\`feedback_json\`)='OBJECT');\n\nDELIMITER $$\n${definitions.join('\n\n')}\nDELIMITER ;\n`;
}
