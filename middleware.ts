import {NextResponse, type NextRequest} from 'next/server';
import {isDiscoverablePath, permitsPublicIndexing, PUBLIC_ORIGIN} from './lib/seo/discovery';
import {marketplaceSecurityHeaders} from './lib/http/security-headers';
import {ADMIN_RETURN_TO_HEADER, safeAdminReturnTo} from './lib/admin/return-context';

function isRoleProvisioningPrefetch(request: NextRequest, pagePath: string) {
 if (request.method !== 'GET' && request.method !== 'HEAD') return false;
 if (pagePath !== '/account' && !pagePath.startsWith('/account/') &&
     pagePath !== '/sell/application' && !pagePath.startsWith('/sell/application/')) return false;
 return request.headers.get('next-router-prefetch') === '1' ||
   ['sec-purpose', 'purpose'].some(header =>
     request.headers.get(header)?.split(';', 1)[0]?.trim().toLowerCase() === 'prefetch');
}

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
 // The Admin layout's guard also runs for child pages with their own filters.
 const pagePath = path.endsWith('.rsc') ? path.slice(0, -4) : path;
 const adminPage = pagePath === '/admin' || pagePath.startsWith('/admin/');
 let forwarded: Headers | undefined;
 if (adminPage || request.headers.has(ADMIN_RETURN_TO_HEADER)) {
   forwarded = new Headers(request.headers);
   forwarded.delete(ADMIN_RETURN_TO_HEADER);
   if (adminPage) {
     const url = new URL(request.url);
     const query = url.searchParams.has('_rsc')
       ? url.search.slice(1).split('&').filter(part => !new URLSearchParams(part).has('_rsc')).join('&')
       : url.search.slice(1);
     forwarded.set(ADMIN_RETURN_TO_HEADER, safeAdminReturnTo(pagePath + (query ? '?' + query : '')));
   }
 }
 // Account and Seller application visits can provision a role. Vinext must fetch the deliberate navigation.
 const response = isRoleProvisioningPrefetch(request, pagePath)
   ? new NextResponse(null, { status: 404 })
   : NextResponse.next(forwarded ? { request: { headers: forwarded } } : undefined);
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
