/** Source-only SQLite/MariaDB parity. Unsupported guards stop generation. */
export function mariaGovernanceSchema(source) {
  let sql=source.replace(/\r\n/g,'\n').replace(/^--> statement-breakpoint\s*$/gm,'');
  const triggers=[];
  sql=sql.replace(/CREATE TRIGGER (\w+) BEFORE (INSERT|UPDATE|DELETE) ON (\w+)\s*(?:WHEN ([\s\S]*?)\s*)?BEGIN SELECT RAISE\(ABORT,'([^']+)'\); END;/g,(_all,name,event,table,condition,message)=>{
    // Retained facts follow SQLite's binary text equality, independently of
    // the FK-compatible native table collation. BINARY also retains spaces.
    const predicate=condition?.replace(/NEW\.(\w+) IS NOT OLD\.(\w+)/g,(_match,next,prior)=>`NOT(BINARY NEW.${next}<=>BINARY OLD.${prior})`)
      .replace(/NEW\.(\w+)\s*<>\s*OLD\.(\w+)/g,(_match,next,prior)=>`BINARY NEW.${next}<>BINARY OLD.${prior}`);
    triggers.push(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW BEGIN\n${predicate?'IF '+predicate+' THEN\n':''}SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message}';\n${predicate?'END IF;\n':''}END$$`);
    return '';
  });
  if(/CREATE\s+TRIGGER|RAISE\s*\(|CREATE\s+(?:UNIQUE\s+)?INDEX[^;]+\bWHERE\b/i.test(sql))throw new Error('Unsupported governance schema guard; explicit native parity is required.');
  const longText=new Set(['body','reason','title','label','impact_summary','plan_text','next_action','resolution_cause','evidence_scope']);
  sql=sql.replace(/\b(\w+) TEXT\b/g,(_all,column)=>`${column} ${column.endsWith('_json')||longText.has(column)?'LONGTEXT':'VARCHAR(191)'}`)
    .replace(/\bINTEGER\b/g,'BIGINT')
    .replace(/json_type\(([^)]+)\)\s*=\s*'([^']+)'/gi,(_all,column,type)=>`JSON_TYPE(${column})='${type.toUpperCase()}'`)
    .replace(/(CREATE TABLE[\s\S]*?\))\s*;/g,'$1 ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  return `${sql.trim()}\n\nDELIMITER $$\n${triggers.join('\n')}\nDELIMITER ;\n`;
}
