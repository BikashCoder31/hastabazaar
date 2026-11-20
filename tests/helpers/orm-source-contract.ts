import {is,SQL} from 'drizzle-orm';
import {getTableConfig,SQLiteSyncDialect,SQLiteTable} from 'drizzle-orm/sqlite-core';
const dialect=new SQLiteSyncDialect();
const expression=(value:unknown):unknown=>is(value,SQL)?dialect.sqlToQuery(value).sql:value;
/** Metadata only: never creates a connection or applies schema. */
export function ormSourceContracts(schema:Record<string,unknown>){
 return Object.fromEntries(Object.values(schema).filter(value=>is(value,SQLiteTable)).map(table=>{
  const config=getTableConfig(table);
  return [config.name,{
   columns:config.columns.map(column=>({name:column.name,type:column.getSQLType(),notNull:column.notNull,primary:column.primary,default:expression(column.default),defaultFn:column.defaultFn?.toString(),unique:column.isUnique})),
   indexes:config.indexes.map(index=>({name:index.config.name,unique:index.config.unique,columns:index.config.columns.map(column=>'name' in column?column.name:expression(column))})),
   checks:config.checks.map(check=>({name:check.name,sql:expression(check.value)})),
   primaryKeys:config.primaryKeys.map(key=>key.columns.map(column=>column.name)),
   uniqueConstraints:config.uniqueConstraints.map(key=>key.columns.map(column=>column.name)),
   foreignKeys:config.foreignKeys.map(key=>{const ref=key.reference();return {columns:ref.columns.map(column=>column.name),foreignTable:getTableConfig(ref.foreignTable).name,foreignColumns:ref.foreignColumns.map(column=>column.name),onDelete:key.onDelete,onUpdate:key.onUpdate};}),
  }];
 }));
}
