/** Translate one retained SQLite guard without changing its predicate or message. */
export function mariaRetainedTrigger(sql:string){
 const normalized=sql.replaceAll('\r\n','\n');
 const match=normalized.match(/^CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE) ON (\w+)\nWHEN ([\s\S]+)\nBEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;$/);
 if(!match)throw new Error('Review the retained SQLite trigger before translating its guard to MariaDB.');
 const[,name,action,table,when,message]=match;
 return `CREATE OR REPLACE TRIGGER ${name} BEFORE ${action} ON ${table} FOR EACH ROW BEGIN IF (${when}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}'; END IF; END$$`;
}
