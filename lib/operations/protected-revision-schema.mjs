/** Future-only native parity for the byte-sensitive counter conditions already authoritative in SQLite0083. */
/** @param {string} source @returns {string} */
export function mariaProtectedRevisionParity(source){
 /** @type {[string,string,string[]][]} */
 const definitions=[['seller_identity_revision_changed','identity_revision',['legal_name','applicant_type','tax_registration_number','representative_name','registration_number','registration_authority','tax_mode']],['seller_bank_revision_changed','bank_revision',['payout_account_reference']]];
 return 'DELIMITER $$\n'+definitions.map(([name,counter,fields])=>{const part=source.replace(/\r\n/g,'\n').split('--> statement-breakpoint').map(part=>part.trim()).find(part=>part.startsWith('CREATE TRIGGER '+name+' '));if(!part)throw Error('Missing authoritative protected revision trigger: '+name);
  const match=/^CREATE TRIGGER \w+ AFTER UPDATE(?: OF \w+)? ON seller_profiles\s+WHEN ([\s\S]+?)\s+BEGIN ([\s\S]+) END;$/.exec(part);if(!match)throw Error('Unsupported protected revision trigger shape.');const seen=[];
  const condition=match[1].replace(/NEW\.(\w+) IS NOT OLD\.(\w+)/g,(_all,next,prior)=>{if(next!==prior||!fields.includes(next))throw Error('Unsupported protected revision field.');seen.push(next);return 'NOT(BINARY NEW.'+next+'<=>BINARY OLD.'+prior+')';});
  if(seen.length!==fields.length||new Set(seen).size!==fields.length||condition.replace(/NOT\(BINARY NEW\.\w+<=>BINARY OLD\.\w+\)|\bOR\b|\s/g,'')!=='')throw Error('Unmapped protected revision condition.');
  if(match[2]!==`UPDATE seller_protected_revisions SET ${counter}=${counter}+1 WHERE seller_id=NEW.id;`)throw Error('Unsupported protected revision counter body.');
  return `CREATE OR REPLACE TRIGGER ${name} AFTER UPDATE ON seller_profiles FOR EACH ROW BEGIN\n IF ${condition} THEN\n ${match[2]}\n END IF;\nEND$$`;
 }).join('\n')+'\nDELIMITER ;\n';
}
