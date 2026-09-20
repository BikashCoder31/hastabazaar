import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {PUBLIC_PAGES,publicUrl,sitemapProducts,xmlEscape,xmlResponse} from '@/lib/seo/discovery';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{page:string}>}) {
 const {page}=await params;if(!/^(0|[1-9][0-9]{0,5})\.xml$/.test(page))return new Response('Not found',{status:404});
 const index=Number(page.slice(0,-4));
 const entries=index===0?PUBLIC_PAGES.map(path=>({path,updatedAt:0})):(await sitemapProducts(requireDatabase(env as unknown as {DB?:D1Database}),index)).map(p=>({path:'/products/'+encodeURIComponent(p.slug),updatedAt:Number(p.updatedAt)}));
 if(!entries.length)return new Response('Not found',{status:404});
 return xmlResponse('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(e=>'<url><loc>'+xmlEscape(publicUrl(e.path))+'</loc>'+(e.updatedAt>0?'<lastmod>'+new Date(e.updatedAt).toISOString()+'</lastmod>':'')+'</url>').join('')+'</urlset>');
}
