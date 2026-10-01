import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, request as proxyRequest } from 'node:http';
import {resolve} from 'node:path';
const fixture = JSON.parse(
  await readFile('outputs/wallet-test-runtime/preview.json', 'utf8'),
);
const origin = 'http://127.0.0.1:43872';
const child = spawn(process.execPath, ['app.cjs'], {
  cwd: 'dist/standalone',
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '43872',
    APP_ORIGIN: origin,
    NODE_ENV: 'production',
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: fixture.database,
    DB_USER: fixture.user,
    DB_PASSWORD: fixture.password,
    MEDIA_ROOT:resolve('outputs/wallet-test-runtime/review-media'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
// Do not print raw server logs: they can contain request or database details.
let errors = '';
child.stderr.on('data', (b) => {
  errors += b.toString();
});
child.stdout.on('data', () => {});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + '/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Standalone health must respond');
  const cookie = `hastabazaar_session=${fixture.token}`;
  const post=async(path,body,auth=cookie)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,Cookie:auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const form=new FormData();form.set('orderItemId',fixture.reviewItemId);form.set('rating','4');form.set('title','Lovely handmade finish');form.set('body','The handmade item arrived safely and matches the description.');form.set('idempotencyKey',crypto.randomUUID());
  const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=','base64');
  form.append('photos',new Blob([photo],{type:'image/png'}),'customer-photo.png');
  const submitted=await fetch(origin+'/api/products/product/reviews',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form});
  assert.equal(submitted.status,201,'Delivered customer can submit a photo review');
  const reviewId=(await submitted.json()).id;
  const adminHtml=await (await fetch(origin+'/admin/reviews',{headers:{Cookie:cookie}})).text();
  const photoPath=adminHtml.match(/\/api\/review-photos\/[a-zA-Z0-9-]+/)?.[0];assert.ok(photoPath,'Admin must see attached photo');
  assert.equal((await fetch(origin+photoPath)).status,404,'Pending photo must be private');
  assert.equal((await fetch(origin+photoPath,{headers:{Cookie:cookie}})).status,200,'Owner/staff can preview pending photo');
  assert.equal((await post(`/api/admin/reviews/${reviewId}`,{action:'publish',note:'Verified local photo review test',idempotencyKey:crypto.randomUUID()})).status,200);
  const publicPhoto=await fetch(origin+photoPath);assert.equal(publicPhoto.status,200);assert.equal(publicPhoto.headers.get('cache-control'),'private, no-store');
  const sellerCookie=`hastabazaar_session=${fixture.sellerToken}`;
  assert.equal((await post(`/api/seller/reviews/${reviewId}/reply`,{body:'Thank you for supporting our maker. We appreciate your feedback.',version:0,idempotencyKey:crypto.randomUUID()},sellerCookie)).status,200);
  let publicHtml=await (await fetch(origin+'/products/wallet-product')).text();assert.ok(!publicHtml.includes('Thank you for supporting our maker.'));
  assert.equal((await post(`/api/admin/reviews/${reviewId}/reply`,{action:'publish',version:1,note:'Helpful local seller response',idempotencyKey:crypto.randomUUID()})).status,200);
  publicHtml=await (await fetch(origin+'/products/wallet-product')).text();assert.ok(publicHtml.includes('Thank you for supporting our maker.'));assert.ok(publicHtml.includes('Verified purchase'));
  assert.equal((await post(`/api/admin/reviews/${reviewId}`,{action:'hide',note:'Local photo withdrawal verification',idempotencyKey:crypto.randomUUID()})).status,200);
  assert.equal((await fetch(origin+photoPath)).status,404,'Hidden photos lose public access immediately');
  // Restore only the disposable review fixture for browser inspection.
  const mysql=await import('mysql2/promise');const localDb=await mysql.default.createConnection({host:'127.0.0.1',port:13316,database:fixture.database,user:fixture.user,password:fixture.password});
  await localDb.execute("UPDATE product_reviews SET status='published' WHERE id=?",[reviewId]);await localDb.end();
  console.log('Standalone reviews: photo upload, private preview, publication, seller reply moderation and immediate photo hiding passed.');
  for (const [path, expected] of [
    ['/account/wallet', 'Your Hastabazaar wallet'],
    ['/checkout', 'Preparing your checkout'],
    ['/admin/referrals', 'Offer settings'],
    ['/referral-terms', 'A clear, simple offer'],
    ['/track','Where’s my order?'],
    ['/admin/order-emails','Latest 50 updates'],
  ]) {
    const response = await fetch(origin + path, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(expected), `${path} must render expected content`);
    assert.doesNotMatch(html, /Sign in with ChatGPT|OpenAI/);
  }
  const track=await fetch(origin+'/api/orders/track',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({orderNumber:fixture.orderNumber,email:'referrer@example.test'})});
  assert.equal(track.status,200,'Guest tracking must work');
  assert.equal(track.headers.get('cache-control'),'no-store');
  const tracking=(await track.json()).tracking;
  assert.equal(tracking.status,'cancelled');
  assert.ok(!JSON.stringify(tracking).includes('referrer@example.test'));
  const badTrack=await fetch(origin+'/api/orders/track',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({orderNumber:fixture.orderNumber,email:'wrong@example.test'})});
  assert.equal(badTrack.status,404);
  const job=await fetch(origin+'/api/jobs/order-emails',{method:'POST'});assert.equal(job.status,401);
  const retry=await fetch(origin+'/api/admin/order-emails/retry',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(retry.status,401);
  console.log('Standalone order tracking, private response, wrong-email rejection and email retry authorization passed.');
  const anonymous = await fetch(origin + '/account/wallet', {
    redirect: 'manual',
  });
  assert.ok([302, 303, 307].includes(anonymous.status));
  const denied = await fetch(origin + '/api/admin/referrals', {
    method: 'PUT',
    headers: {
      Cookie: cookie,
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  const settings = await fetch(origin + '/api/admin/referrals', {
    method: 'PUT',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      enabled: true,
      friendDiscountPaisa: 5000,
      rewardPaisa: 5000,
      minimumSubtotalPaisa: 150000,
      returnWindowDays: 7,
      reason: 'Local build verification only',
    }),
  });
  assert.equal(settings.status, 200, 'Super Admin settings must save');
  const invalid = await fetch(origin + '/r/invalid', { redirect: 'manual' });
  assert.equal(invalid.status, 404);
  const invitation = await fetch(origin + '/r/AAAAAAAAAAAAAAAA', {
    redirect: 'manual',
  });
  assert.equal(invitation.status, 302);
  assert.equal(
    invitation.headers.get('location'),
    '/referral-terms',
    'Invitation redirects must preserve the public proxy origin',
  );
  assert.match(
    invitation.headers.get('set-cookie') || '',
    /HttpOnly; SameSite=Lax; Secure/,
  );
  console.log(
    'Standalone wallet: health, authenticated wallet/checkout/admin, public terms, anonymous protection, hostile-origin rejection and offer settings passed.',
  );
  if (process.argv.includes('--serve')) {
    // Local-only preview for the disposable fixture, without showing session tokens in URLs or browser automation.
    const proxy = createServer((request, response) => {
      const headers = {
        ...request.headers,
        host: '127.0.0.1:43872',
        cookie: (request.url?.startsWith('/seller') || request.url?.startsWith('/api/seller')) ? sellerCookie : cookie,
      };
      if (headers.origin === 'http://127.0.0.1:43873') headers.origin = origin;
      const upstream = proxyRequest(
        origin + (request.url || '/'),
        { method: request.method, headers },
        (result) => {
          response.writeHead(result.statusCode || 502, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => {
        response.writeHead(502);
        response.end('Preview unavailable');
      });
      request.pipe(upstream);
    });
    await new Promise((resolve) => proxy.listen(43873, '127.0.0.1', resolve));
    console.log('Disposable local wallet preview ready on port 43873.');
    await new Promise(() => {});
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Built wallet verification failed',
  );
  process.exitCode = 1;
} finally {
  child.kill();
}
