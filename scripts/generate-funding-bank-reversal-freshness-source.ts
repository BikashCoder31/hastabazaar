/** Source generation only; no connection, migration or bank operation. */
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fundingStatementBankReversalFreshSql,FUNDING_BANK_REVERSAL_REVERIFY_CODE} from '../lib/payments/funding-bank-reversal-freshness';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
type Guard={name:string;table:string;action:'INSERT'|'UPDATE';when:string};
const statementFresh=`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=NEW.funding_statement_id AND ${fundingStatementBankReversalFreshSql('s')})`;
const guards:Guard[]=[...['outgoing_payment_packets','payout_transfer_packets'].flatMap((table,index):Guard[]=>[
 {name:'funding_bank_reversal_new_'+index,table,action:'INSERT',when:`NEW.amount_paisa>0 AND NEW.funding_statement_id IS NOT NULL AND NOT ${statementFresh}`},
 {name:'funding_bank_reversal_unsent_'+index,table,action:'UPDATE',when:`NEW.amount_paisa>0 AND OLD.state IN('prepared','approved') AND NEW.state IN('prepared','approved','processing') AND NOT ${statementFresh}`},
]),{name:'funding_bank_reversal_reservation',table:'company_funding_accounts',action:'UPDATE',when:`NEW.statement_id=OLD.statement_id AND NEW.revision<>OLD.revision AND NOT EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=OLD.statement_id AND ${fundingStatementBankReversalFreshSql('s')})`}];
const sqlite='-- Source only. Canonical/live migration remains held.\n-- A later actual bank reversal requires an independently reverified balance, never an inferred replacement.\n'+guards.map(g=>`CREATE TRIGGER ${g.name} BEFORE ${g.action} ON ${g.table}\nWHEN ${g.when}\nBEGIN SELECT RAISE(ABORT,'${FUNDING_BANK_REVERSAL_REVERIFY_CODE}'); END;`).join('\n--> statement-breakpoint\n')+'\n';
const maria='-- Source parity for 0144; execution remains held.\nDELIMITER $$\n'+guards.map(g=>`CREATE OR REPLACE TRIGGER ${g.name} BEFORE ${g.action} ON ${g.table} FOR EACH ROW BEGIN IF (${g.when}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${FUNDING_BANK_REVERSAL_REVERIFY_CODE}'; END IF; END$$`).join('\n')+'\nDELIMITER ;\n';
await writeFile(resolve(root,'drizzle/0144_funding_bank_reversal_freshness.sql'),sqlite);
await writeFile(resolve(root,'deployment/babal/mariadb-funding-bank-reversal-freshness.sql'),maria);
