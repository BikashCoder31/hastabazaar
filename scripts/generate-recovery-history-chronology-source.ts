/** Source only: preserve earlier migrations and replace the native proof gate. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicalRecoveryCandidatesSql} from '../lib/payments/recovery-historical';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const proof=(model:'registered'|'managed')=>`EXISTS(SELECT 1 FROM (${historicalRecoveryCandidatesSql(model,'NEW.refund_id','NEW.seller_id')}) native_source WHERE native_source.kind=NEW.kind AND native_source.payoutId=NEW.payout_id AND native_source.scopeId=NEW.scope_id AND native_source.capacityPaisa=NEW.native_deduction_paisa AND native_source.nativeProof=1)`;
const when=`NOT EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.id=NEW.case_id AND c.revision=NEW.case_revision AND c.seller_id=NEW.seller_id AND c.refund_id=NEW.refund_id AND (c.payout_model='registered' AND NEW.kind='registered_refund_group' AND ${proof('registered')} OR c.payout_model='managed' AND NEW.kind IN('managed_allocation','managed_legacy_group') AND ${proof('managed')}))`;
const sqlite=`-- Source only. A later refund cannot consume an earlier completed native deduction.
DROP TRIGGER recovery_historical_native_source;
--> statement-breakpoint
CREATE TRIGGER recovery_historical_native_source BEFORE INSERT ON seller_recovery_historical_attributions
WHEN ${when}
BEGIN SELECT RAISE(ABORT,'recovery_historical_actual_native_source_required'); END;
`;
const maria=`-- Source parity only; native execution remains held.
DELIMITER $$
CREATE OR REPLACE TRIGGER recovery_historical_native_source BEFORE INSERT ON seller_recovery_historical_attributions FOR EACH ROW BEGIN IF (${when}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='recovery_historical_actual_native_source_required'; END IF; END$$
DELIMITER ;
`;
await writeFile(resolve(root,'drizzle/0135_recovery_history_chronology.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-recovery-history-chronology.sql'),maria);
