import {PUBLIC_ORIGIN, permitsPublicIndexing} from '@/lib/seo/discovery';
export function GET(request: Request){
 if(!permitsPublicIndexing(request.url,process.env.APP_ORIGIN)) return new Response('User-agent: *\nDisallow: /\n',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
 return new Response(`User-agent: *
Allow: /
Disallow: /account
Disallow: /admin
Disallow: /seller
Disallow: /rider
Disallow: /orders
Disallow: /checkout
Disallow: /cart
Disallow: /login
Disallow: /register
Disallow: /track
Disallow: /api/
Allow: /api/product-media/
Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
