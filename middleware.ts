import {NextResponse, type NextRequest} from 'next/server';
import {isDiscoverablePath, permitsPublicIndexing, PUBLIC_ORIGIN} from './lib/seo/discovery';
import {marketplaceSecurityHeaders} from './lib/http/security-headers';
export function middleware(request: NextRequest) {
 const path=request.nextUrl.pathname;
 const origin=request.nextUrl.origin;
 if ((request.method==='GET' || request.method==='HEAD') &&
     (origin==='http://www.hastabazaar.com' || origin==='https://www.hastabazaar.com') &&
     permitsPublicIndexing('http://hastabazaar.com',process.env.APP_ORIGIN) && isDiscoverablePath(path)) {
   const canonical=new URL(PUBLIC_ORIGIN);
   canonical.pathname=path; canonical.search=request.nextUrl.search;
   return NextResponse.redirect(canonical,308);
 }
 const response=NextResponse.next();
 if(!permitsPublicIndexing(request.url, process.env.APP_ORIGIN) || !isDiscoverablePath(path) || (path==='/shop' && request.nextUrl.search)) response.headers.set('X-Robots-Tag','noindex, nofollow');
 // Public HTML also contains the signed-in navigation. Do not share-cache it.
 response.headers.set('Cache-Control','private, no-store');
 if(process.env.NODE_ENV!=='production') return response;
 for(const [key,value] of Object.entries(marketplaceSecurityHeaders)) response.headers.set(key,value);
 // Host-only HSTS; do not assert readiness of unrelated subdomains or preload.
 if(process.env.APP_ORIGIN?.startsWith('https://')) response.headers.set('Strict-Transport-Security','max-age=86400');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
