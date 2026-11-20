import {createHash} from 'node:crypto';

/** Catch up the frozen0020 Maria base from the already canonical0033/0035 SQLite contracts.
 * The existing table/rows/FKs are retained; only additive columns and nullable recipients change. */
export function notificationRuntimeMariaSource(business,guest){
 const fields=[...business.matchAll(/ALTER TABLE notification_messages ADD COLUMN ([a-z_]+) (TEXT|INTEGER)([^;]*);/g)];
 const expected=['business_event_key','required_permission','delivery_attempts','delivery_next_attempt_at','delivery_lease_until','delivery_claim_token'];
 if(fields.length!==expected.length||fields.some((field,index)=>field[1]!==expected[index]))throw new Error('Review the changed0033 canonical outbox contract before regeneration.');
 const guestFields=['guest_email','guest_order_id'];
 for(const name of guestFields)if(!new RegExp('`'+name+'` text\\s*[,]').test(guest))throw new Error('Review the changed0035 guest field contract.');
 if(!/`recipient_user_id` text\s*,/.test(guest))throw new Error('The canonical guest recipient must be nullable.');
 const shape=/CHECK \((recipient_user_id[\s\S]*?)\),\s*FOREIGN KEY/.exec(guest)?.[1];
 if(!shape)throw new Error('The canonical guest recipient constraint is missing.');
 const names=['recipient_user_id','audience_role','channel','guest_email','guest_order_id','business_event_key'];
 const predicate=shape.replace(/'(?:''|[^'])*'|\b[a-z_]+\b/g,token=>names.includes(token)?'NEW.'+token:token).replace(/NEW\.(audience_role|channel)\s*=\s*('(?:''|[^'])*')/g,'BINARY NEW.$1=BINARY $2');
 const index=/CREATE INDEX (?:IF NOT EXISTS )?(idx_business_notification_queue) ON notification_messages\(([^)]+)\)/.exec(business);
 if(!index||index[2].replaceAll(' ','')!=='channel,status,delivery_next_attempt_at,delivery_lease_until')throw new Error('Review the canonical retry/lease index before regeneration.');
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const lines=['-- Derived exclusively from existing SQLite 0033 and 0035; no new SQLite migration.',`-- 0033 SHA256 ${hash(business)}`,`-- 0035 SHA256 ${hash(guest)}`];
 for(const[,name,type,tail]of fields){const nullable=/NOT NULL/.test(tail)?' NOT NULL':' NULL',defaultValue=/DEFAULT 0/.test(tail)?' DEFAULT 0':'';lines.push(`ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS ${name} ${type==='TEXT'?'LONGTEXT':'BIGINT'}${nullable}${defaultValue};`);}
 for(const name of guestFields)lines.push(`ALTER TABLE notification_messages ADD COLUMN IF NOT EXISTS ${name} LONGTEXT NULL;`);
 lines.push('ALTER TABLE notification_messages MODIFY COLUMN recipient_user_id VARCHAR(191) NULL;',`CREATE INDEX IF NOT EXISTS ${index[1]} ON notification_messages(${index[2]});`);
 // MariaDB rejects some CHECK/FK referential-action combinations. These strict BEFORE
 // INSERT and UPDATE guards enforce the exact original predicate instead of omitting it.
 for(const event of ['INSERT','UPDATE'])lines.push('DELIMITER $$',`CREATE OR REPLACE TRIGGER notification_recipient_shape_${event.toLowerCase()} BEFORE ${event} ON notification_messages FOR EACH ROW BEGIN IF NOT (${predicate}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notification_recipient_shape'; END IF; END$$`,'DELIMITER ;');
 return lines.join('\n')+'\n';
}
