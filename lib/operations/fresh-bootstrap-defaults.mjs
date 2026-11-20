const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll('\\','\\\\').replaceAll("'","''")+"'";
const quote=name=>'`'+name+'`';
const fail=code=>`SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='bootstrap_fresh_defaults_${code}';`;
const predicate=row=>Object.entries(row).map(([name,value])=>value&&typeof value==='object'&&value.generatedTimestamp?`${quote(name)} BETWEEN 1 AND 9007199254740991 AND ${quote(name)}<=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000`:`BINARY ${quote(name)} <=> BINARY ${literal(value)}`).join(' AND ');
export function buildFreshBootstrapDefaults({allTables,baselineRows,prefixRows,taxonomy}){
 const seedRows={
  referral_campaign:[{id:'default',enabled:1,friend_discount_paisa:5000,reward_paisa:5000,minimum_subtotal_paisa:150000,return_window_days:7,updated_at:0}],
  delivery_rate_versions:[{id:'initial-150-180-250',config_json:'{"zones":{"valley":15000,"terai":18000,"nationwide":25000},"districts":{}}',created_by:null,reason:'Original approved delivery tariff',created_at:0}],
  delivery_rate_current:[{id:'default',version_id:'initial-150-180-250'}],
  homepage_hero_media:[['nepal-craft',320794],['maker-hands',209526],['meaningful-gifts',233764]].map(([stem,size])=>({id:'system-'+stem+'-hero',object_key:'public/homepage/'+stem+'-hero.webp',original_name:stem+'-hero.webp',mime_type:'image/webp',size_bytes:size,width:1800,height:1125,duration_seconds:null,created_by:null,created_at:0,archived_at:null})),
 };
 const baselineSeeds=['rider_policy_versions','rider_policy','commission_control','loyalty_revisions','loyalty_config','marketplace_fee_waiver_control','customer_fee_waiver_control','categories','occasions','hastabazaar_schema_versions','company_payment_account_current','commission_terms_scan_state'];
 const permitted=new Set([...baselineSeeds,...Object.keys(seedRows)]);
 const sql=['-- FRESH BOOTSTRAP ONLY. Never use this default activation block as a populated upgrade.',
 '-- Known interrupted fresh defaults resume. Other configuration requires operator reconciliation.',
 '-- No existing configuration is updated and no historical audit or consent is manufactured.',
 'DELIMITER $$','BEGIN NOT ATOMIC',
 ` IF DATABASE() IS NULL OR @@FOREIGN_KEY_CHECKS<>1 THEN ${fail('session_state')} END IF;`];
 for(const table of allTables){
  sql.push(` IF NOT EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${literal(table)} AND TABLE_TYPE='BASE TABLE') THEN ${fail('missing_table')} END IF;`);
  if(!permitted.has(table))sql.push(` IF EXISTS(SELECT 1 FROM ${quote(table)} LIMIT 1) THEN ${fail('populated_'+table)} END IF;`);
 }
 for(const [table,rows]of Object.entries(seedRows))sql.push(` IF EXISTS(SELECT 1 FROM ${quote(table)} WHERE NOT (${rows.map(row=>'('+predicate(row)+')').join(' OR ')})) THEN ${fail('existing_'+table)} END IF;`);
 for(const [table,row]of Object.entries(taxonomy))sql.push(` IF EXISTS(SELECT 1 FROM ${quote(table)} WHERE (id=${literal(row.id)} OR slug='others' OR LOWER(TRIM(name_en))='others') AND NOT (${predicate(row)})) THEN ${fail('existing_'+table+'_others')} END IF;`);
 for(const [table,rows]of Object.entries(prefixRows)){
  const key=table==='hastabazaar_schema_versions'?'version':'id',allowed=[...rows,...taxonomy[table]?[taxonomy[table]]:[]];
  sql.push(` IF (SELECT COUNT(*) FROM ${quote(table)} WHERE ${quote(key)} IN (${rows.map(row=>literal(row[key])).join(',')}))<>${rows.length} OR EXISTS(SELECT 1 FROM ${quote(table)} WHERE NOT (${allowed.map(row=>'('+predicate(row)+')').join(' OR ')})) THEN ${fail('existing_'+table+'_prefix')} END IF;`);
  if(table!=='hastabazaar_schema_versions')sql.push(` IF EXISTS(SELECT 1 FROM ${quote(table)} WHERE id IN (${rows.map(row=>literal(row.id)).join(',')}) AND created_at<>updated_at) THEN ${fail('edited_'+table+'_timestamp')} END IF;`);
 }
 for(const [table,row]of Object.entries(baselineRows))sql.push(` IF (SELECT COUNT(*) FROM ${quote(table)})<>1 OR EXISTS(SELECT 1 FROM ${quote(table)} WHERE NOT (${predicate(row)})) THEN ${fail('existing_'+table)} END IF;`);
 // Every refusal is above this boundary, so an ambiguous target receives no default writes.
 sql.push(' -- Fresh target proved. Only absent canonical defaults are inserted below.');
 for(const [table,rows]of Object.entries(seedRows))for(const row of rows)sql.push(` IF NOT EXISTS(SELECT 1 FROM ${quote(table)} WHERE id=${literal(row.id)}) THEN\n  INSERT INTO ${quote(table)} (${Object.keys(row).map(quote).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n END IF;`);
 for(const [table,row]of Object.entries(taxonomy))sql.push(` IF NOT EXISTS(SELECT 1 FROM ${quote(table)} WHERE id=${literal(row.id)} OR slug='others' OR LOWER(TRIM(name_en))='others') THEN\n  INSERT INTO ${quote(table)} (${Object.keys(row).map(quote).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});\n END IF;`);
 sql.push('END$$','DELIMITER ;','');return sql.join('\n');
}
