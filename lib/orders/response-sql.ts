/** SQL expressions are supplied only by these domain queries; user values remain bound parameters. */
export function responseScopeContains(db:D1Database,json:string,value:string){
 return (db as D1Database&{dialect?:string}).dialect==='mariadb'
  ?`JSON_CONTAINS(${json},JSON_QUOTE(${value}))=1`
  :`EXISTS(SELECT 1 FROM json_each(${json}) response_scope WHERE response_scope.value=${value})`;
}
