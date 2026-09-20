import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';

export async function getProductMaterialSuggestions(database:D1Database):Promise<readonly string[]>{
  const clock=await database.prepare("SELECT unixepoch('now') * 1000 AS now").first<{now:number}>();
  return (await getEffectiveBusinessSetting(database,'product_material_suggestions',Number(clock?.now??0))).value;
}
