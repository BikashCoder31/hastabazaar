import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {publicUrl,sitemapProductCount,xmlEscape,xmlResponse} from '@/lib/seo/discovery';
export const dynamic='force-dynamic';
export async function GET(){
 const count=await sitemapProductCount(requireDatabase(env as unknown as {DB?:D1Database}));
 const pages=Array.from({length:1+Math.ceil(count/1000)},(_,i)=>`<sitemap><loc>${xmlEscape(publicUrl('/sitemaps/'+i+'.xml'))}</loc></sitemap>`).join('');
 return xmlResponse('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages+'</sitemapindex>');
}
