# Site-wide Responsive Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing and future image, video, and video poster on HastaBazaar responsive by purpose from 320 px phones through wide desktops, without changing media authorization, upload safety, storage, privacy, accessibility, or interaction behavior.

**Architecture:** Add a typed `lib/media/responsive-media.ts` contract for presentation modes, frame/object class names, and purpose-specific `sizes`, backed by low-specificity CSS in `app/globals.css`. Migrate each render site to an explicit `data-media-mode` and reserved frame or intrinsic dimensions, then enforce the contract with an AST-based repository policy test that scans production TSX and rejects unclassified `<Image>`, `<img>`, `<video>`, fill images without `sizes`, unreserved video/poster frames, and dynamic CSS-background bypasses. Keep authorization-aware raw elements and direct hero-video refs; the rendering surface, not the upload record, owns responsive behavior.

**Tech Stack:** React 19, TypeScript 5.9, Vinext/Next-compatible `next/image`, Tailwind CSS 4, Node test runner via `tsx`, TypeScript compiler AST, existing Embla carousel, existing local-staging D1/R2-compatible media routes, Codex Browser tooling for viewport QA.

**Spec:** `docs/superpowers/specs/2026-09-22-site-wide-responsive-media-design.md`

## Global Constraints

- Work only in `C:\Users\abinash\.codex\worktrees\hastabazaar-v1-2-1-staging\Hatskala` on `codex/hastabazaar-v1-2-1-staging`.
- Before implementation, require `537f009` and `61c1422` to remain ancestors of `HEAD`; do not recreate the worktree or modify `C:\Users\abinash\Desktop\Hatskala`.
- Local staging only: no deployment, production access, production configuration change, production migration, or production-data claim.
- Treat this as presentation/rendering work; do not change catalogue records, object keys, upload destinations, public/private route boundaries, or storage behavior.
- Preserve all MIME, signature, byte-size, pixel-count, decode/orientation, metadata-stripping, safe re-encoding, MP4 container/duration/dimension, authentication, authorization, publication, and privacy checks.
- Every rendered asset declares exactly one purpose-aware mode: `cover`, `contain`, or `natural`.
- Preserve intrinsic proportions, reserve space before load, and never solve overflow by stretching, blanket `height: auto`, or hiding page overflow.
- Preserve meaningful alt text, decorative empty alt text, video descriptions, controls, muted/autoplay/poster/preload rules, carousel/gallery state, focus access, and reduced-motion behavior.
- Keep priority/eager loading limited to current above-the-fold media; keep offscreen media lazy and videos conservatively preloaded.
- Use test-driven development: add each focused regression first, observe the intended failure, implement the smallest correct migration, and rerun the focused suite before committing.
- Commit only to the existing staging branch. Production remains unverified and unapproved.

## Review Focus

- A 320 px container containing a preferred 192 px QR/logo or fixed admin thumbnail must shrink without cropping, distortion, or page-level overflow; Task 4 pins this with QR/logo assertions and Task 7 checks it in-browser.
- Authorization-aware `/api/...` image/video URLs must remain byte-for-byte unchanged while receiving the shared rendering contract; Tasks 2–6 assert the exact routes.
- Homepage image, reduced-motion poster, active video, and Super Admin preview must use the same cover frame while retaining pause, preload, poster, and reduced-motion behavior; Tasks 2 and 6 test all four states.
- Product demonstrations, review/evidence/document media, and instructional assets must never inherit a destructive crop; Tasks 3–6 require `contain` and Task 7 visually checks essential content.
- A future TSX render site must fail CI when it omits a mode/frame, omits `sizes` on a fill image, introduces an unbounded video, or uses dynamic `backgroundImage` to evade the contract; Tasks 1 and 6 exercise each failure class.

---

## File Map

### New files

- `lib/media/responsive-media.ts` — typed mode names, shared class helpers, and purpose-specific responsive image `sizes` values.
- `tests/helpers/responsive-media-policy.ts` — TypeScript-AST scanner for production TSX render sites.
- `tests/responsive-media-contract.test.ts` — unit coverage for the shared contract, global safety baseline, and policy-scanner failure cases.
- `tests/responsive-media-public.test.ts` — homepage, editorial, catalogue, product-gallery, shop, and maker source regressions.
- `tests/responsive-media-account.test.ts` — cart, wishlist, review attachment, QR, logo, access-denied, footer, and 404 regressions.
- `tests/responsive-media-operations.test.ts` — seller upload preview, seller product media, admin hero/product media, and private-route preservation regressions.
- `tests/responsive-media-policy.test.ts` — repository-wide zero-violation enforcement under `app/` and `components/`.
- `docs/testing/site-wide-responsive-media-self-test.md` — completed browser matrix, route/state evidence, console/network findings, and visual mismatch ledger.

### Modified files

- `app/globals.css` — low-specificity overflow guard plus shared frame/object/loading/shrink classes and fluid hero/editorial frame bounds.
- `components/homepage/homepage-hero-carousel.tsx` — cover contract for image, reduced-motion poster, and active video without changing refs/playback.
- `components/homepage/homepage-occasion-carousel.tsx` — responsive decorative cover image and bounded `sizes`.
- `app/page.tsx` — category and maker editorial frames and `sizes`.
- `components/catalog/product-card.tsx` — typed `sizes` input and cover contract.
- `components/catalog/product-slider.tsx` — pass slider-specific responsive `sizes`.
- `components/catalog/recently-viewed.tsx` — pass grid-specific responsive `sizes`.
- `components/catalog/product-gallery.tsx` — contained main image/video and cover thumbnails with stable frames.
- `app/shop/page.tsx` — two/three-column product-card cover contract and accurate grid `sizes`.
- `app/makers/[id]/page.tsx` — maker product-card cover contract and accurate grid `sizes`.
- `components/commerce/cart-view.tsx` — stable cover thumbnail frame.
- `components/account/saved-product-grid.tsx` — responsive cover cards.
- `components/commerce/review-attachments.tsx` — shrink-safe contained customer attachments.
- `components/commerce/document-machine-codes.tsx` — shrink-safe contained QR while preserving the preferred 192 px size.
- `components/layout/site-header.tsx` — contained intrinsic logo.
- `components/layout/site-footer.tsx` — natural intrinsic lockup.
- `app/not-found.tsx` — fluid reserved cover art frame and bounded `sizes`.
- `app/staff-access-denied/page.tsx` — contained brand mark.
- `app/seller-access-denied/page.tsx` — contained brand mark.
- `components/seller/product-submission-form.tsx` — replace CSS-background upload previews with accessible cover images and contain video previews.
- `app/seller/products/page.tsx` — cover inventory thumbnail.
- `app/seller/layout.tsx` — contained workspace logo.
- `components/admin/homepage-hero-preview.tsx` — same cover geometry for authenticated image/video/poster preview.
- `app/admin/homepage/page.tsx` — cover product preview thumbnail.
- `app/admin/products/page.tsx` — cover review-queue thumbnail.
- `app/admin/products/[id]/page.tsx` — contained review images and controlled contained MP4 previews.
- `app/admin/layout.tsx` — contained operations logo.
- `tests/homepage-hero-presentation.test.ts` — shared hero geometry/mode assertions.
- `tests/homepage-hero-carousel.test.ts` — preserve playback, preload, and reduced-motion assertions.
- `tests/product-gallery.test.ts` — preserve selection/count behavior and add image/video mode assertions.
- `tests/not-found-page.test.ts` — preserve recovery behavior and add frame/mode assertions.

### Audited without code changes

- `app/rider/page.tsx`, `components/rider/rider-forms.tsx`, and `app/api/rider/media/[id]/route.ts` remain download/upload surfaces rather than inline evidence previews; do not broaden private evidence exposure.
- `app/admin/cases/**`, `app/seller/cases/**`, and `app/api/return-evidence/[id]/route.ts` remain download-only where currently implemented.
- `app/api/product-media/[id]/route.ts`, `app/api/review-photos/[id]/route.ts`, `app/api/homepage/hero-media/[id]/route.ts`, and `app/api/admin/homepage/hero-media/[id]/route.ts` keep their authorization/cache/content behavior unchanged.
- `app/admin/sellers/[id]/page.tsx`, `app/api/admin/seller-profile-media/[id]/route.ts`, and seller-application document routes remain authorized download/review surfaces where they do not currently render inline; no private seller evidence becomes public or inline merely for this project.
- `lib/products/submission.ts`, `lib/media/product-video.ts`, `lib/homepage/hero-media.ts`, `lib/reviews/uploads.ts`, `lib/reviews/sanitize-photo.ts`, and `lib/riders/media-upload.ts` keep validation and preparation logic unchanged.

---

## Execution Preflight — no file changes

- [ ] **Step 1: Reconfirm the isolated worktree and ancestry**

Run from the required worktree:

```powershell
git branch --show-current
git status --short
git merge-base --is-ancestor 537f009 HEAD; if ($LASTEXITCODE -ne 0) { throw '537f009 is not an ancestor' }
git merge-base --is-ancestor 61c1422 HEAD; if ($LASTEXITCODE -ne 0) { throw '61c1422 is not an ancestor' }
```

Expected: branch `codex/hastabazaar-v1-2-1-staging`; only the approved plan file may be uncommitted; both ancestry commands exit `0`.

- [ ] **Step 2: Establish a baseline without mutating staging data**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
```

Expected: all three gates pass. If a pre-existing failure appears, record it before changing responsive-media code and stop that task from masking it.

---

### Task 1: Shared responsive-media contract and policy engine

**Files:**
- Create: `lib/media/responsive-media.ts`
- Create: `tests/helpers/responsive-media-policy.ts`
- Create: `tests/responsive-media-contract.test.ts`
- Modify: `app/globals.css:81-106`
- Modify: `app/globals.css:108-180`

**Interfaces:**
- Consumes: `cn(...inputs: ClassValue[])` from `lib/utils.ts` and production TSX source text.
- Produces: `MediaMode`, `MediaSizePurpose`, `mediaSizes`, `mediaFrameClass(mode, className?)`, `mediaObjectClass(mode, className?)`, `MediaPolicyViolation`, `auditResponsiveMediaSource(file, source)`, and `scanResponsiveMediaRenderSites(root)`.

- [ ] **Step 1: Write failing contract and policy-fixture tests**

Create `tests/responsive-media-contract.test.ts` with exact checks for typed modes, every named size purpose, CSS behavior, and scanner fixtures:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '../lib/media/responsive-media';
import { auditResponsiveMediaSource } from './helpers/responsive-media-policy';

void test('responsive media exposes explicit modes and bounded size purposes', () => {
  assert.match(mediaFrameClass('cover'), /media-frame/);
  assert.match(mediaObjectClass('cover'), /media-object-cover/);
  assert.match(mediaObjectClass('contain'), /media-object-contain/);
  assert.match(mediaObjectClass('natural'), /media-object-natural/);
  for (const key of ['editorial', 'occasion', 'productSlider', 'productGrid', 'shopGrid', 'productGallery', 'galleryThumbnail', 'savedProduct', 'cartThumbnail', 'reviewAttachment', 'adminThumbnail', 'brandMark', 'footerLogo', 'qr', 'makerGrid', 'notFound'] as const) {
    assert.ok(mediaSizes[key].length > 0, `${key} sizes must be defined`);
  }
});

void test('global media safety never forces fill media to automatic height', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /:where\(img, video\)[\s\S]*?max-inline-size:\s*100%/);
  assert.doesNotMatch(css, /:where\(img, video\)[\s\S]{0,120}height:\s*auto/);
  assert.match(css, /\.media-object-cover[\s\S]*?object-fit:\s*cover/);
  assert.match(css, /\.media-object-contain[\s\S]*?object-fit:\s*contain/);
  assert.match(css, /\.media-object-natural[\s\S]*?height:\s*auto/);
  assert.match(css, /\.media-shrink[\s\S]*?max-inline-size:\s*100%/);
});

void test('policy rejects every unsupported render shape', () => {
  const invalid = [
    '<Image src="/x.jpg" alt="x" fill />',
    '<img src={url} alt="x" />',
    '<video src={url} controls />',
    '<div style={{ backgroundImage: `url(${preview})` }} />',
  ];
  for (const source of invalid) {
    assert.ok(auditResponsiveMediaSource('fixture.tsx', source).length > 0);
  }
  assert.deepEqual(
    auditResponsiveMediaSource(
      'fixture.tsx',
      '<div data-media-frame="cover"><Image data-media-mode="cover" src="/x.jpg" alt="x" fill sizes="100vw" className={mediaObjectClass(\'cover\')} /></div>',
    ),
    [],
  );
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `npx tsx --test tests/responsive-media-contract.test.ts`

Expected: FAIL because the contract and scanner modules do not exist and the CSS baseline is absent.

- [ ] **Step 3: Implement the typed rendering contract**

Create `lib/media/responsive-media.ts` with these public names and values; keep it dependency-light so client and server components can both import it:

```ts
import { cn } from '@/lib/utils';

export type MediaMode = 'cover' | 'contain' | 'natural';

export const mediaSizes = {
  editorial: '(min-width: 1440px) 744px, (min-width: 1024px) 52vw, 100vw',
  occasion: '100vw',
  productSlider: '(min-width: 1536px) 302px, (min-width: 1024px) 23vw, (min-width: 640px) 42vw, 78vw',
  productGrid: '(min-width: 1280px) 22vw, (min-width: 640px) 46vw, 100vw',
  shopGrid: '(min-width: 1280px) 29vw, (min-width: 640px) 46vw, 46vw',
  productGallery: '(min-width: 1440px) 676px, (min-width: 1024px) 52vw, 100vw',
  galleryThumbnail: '(min-width: 1024px) 10vw, 18vw',
  savedProduct: '(min-width: 1280px) 25vw, (min-width: 640px) 46vw, 100vw',
  cartThumbnail: '(min-width: 640px) 128px, 80px',
  reviewAttachment: '96px',
  adminThumbnail: '96px',
  brandMark: '48px',
  footerLogo: '208px',
  qr: '192px',
  makerGrid: '(min-width: 1280px) 22vw, (min-width: 640px) 46vw, 100vw',
  notFound: '(min-width: 1440px) 720px, (min-width: 1024px) 52vw, 100vw',
} as const;

export type MediaSizePurpose = keyof typeof mediaSizes;

export function mediaFrameClass(mode: MediaMode, className?: string): string {
  return cn('media-frame', `media-frame-${mode}`, className);
}

export function mediaObjectClass(mode: MediaMode, className?: string): string {
  return cn('media-object', `media-object-${mode}`, className);
}
```

- [ ] **Step 4: Add the low-specificity CSS baseline and shared classes**

Add this behavior under the existing Tailwind layers, without `overflow-x: hidden` on `html` or `body`:

```css
@layer base {
  :where(img, video) {
    max-inline-size: 100%;
  }
}

@layer components {
  .media-frame {
    position: relative;
    min-inline-size: 0;
    overflow: hidden;
    background: var(--muted);
  }

  .media-object {
    display: block;
    max-inline-size: 100%;
  }

  .media-object-cover,
  .media-object-contain {
    width: 100%;
    height: 100%;
  }

  .media-object-cover { object-fit: cover; }
  .media-object-contain { object-fit: contain; }
  .media-object-natural { width: auto; height: auto; }
  .media-shrink { max-inline-size: 100%; height: auto; }
  .media-loading { background: var(--muted); }
}
```

- [ ] **Step 5: Implement the AST scanner**

In `tests/helpers/responsive-media-policy.ts`, parse TSX with `typescript.createSourceFile(..., ScriptKind.TSX)`. Report `{ file, line, rule }` for:

```ts
export interface MediaPolicyViolation {
  file: string;
  line: number;
  rule:
    | 'missing-mode'
    | 'missing-frame'
    | 'fill-image-missing-sizes'
    | 'unbounded-fixed-width'
    | 'dynamic-background-image';
}
```

Recognize only exact JSX tags `Image`, `img`, and `video`; ignore `ImageIcon` and SVG/icon components. Require a literal `data-media-mode="cover|contain|natural"`; when a frame exists, require its literal `data-media-frame` value to match the element mode. Require fill-mode `Image` to have a non-empty `sizes`; require `Image`/`img`/`video` to have intrinsic `width` and `height`, its own `data-media-frame`, or an ancestor with `data-media-frame`; flag JSX `style` properties containing `backgroundImage`; and report `unbounded-fixed-width` for inline or arbitrary-pixel CSS widths above 320 px unless the element is inside a frame or carries `media-shrink`. Numeric `width`/`height` props are intrinsic metadata, not CSS widths, and remain valid with the global max-inline-size guard. `scanResponsiveMediaRenderSites(root)` recursively reads `.tsx` files only under `app/` and `components/`, excluding generated/build directories by construction.

- [ ] **Step 6: Run the focused contract test and verify GREEN**

Run: `npx tsx --test tests/responsive-media-contract.test.ts`

Expected: PASS. Do not run the repository-wide zero-violation assertion until Task 6, after all known render sites are migrated.

- [ ] **Step 7: Commit the foundation**

```powershell
git add app/globals.css lib/media/responsive-media.ts tests/helpers/responsive-media-policy.ts tests/responsive-media-contract.test.ts docs/superpowers/plans/2026-09-22-site-wide-responsive-media.md
git commit -m "feat: add responsive media contract"
```

---

### Task 2: Homepage hero and editorial media

**Files:**
- Create: `tests/responsive-media-public.test.ts`
- Modify: `tests/homepage-hero-presentation.test.ts`
- Modify: `tests/homepage-hero-carousel.test.ts`
- Modify: `components/homepage/homepage-hero-carousel.tsx:245-353`
- Modify: `components/homepage/homepage-occasion-carousel.tsx:211-232`
- Modify: `app/page.tsx:240-280`
- Modify: `app/page.tsx:474-488`
- Modify: `app/globals.css:178-200`
- Modify: `app/globals.css:338-346`
- Modify: `app/globals.css:444-491`
- Modify: `app/globals.css:809-845`
- Modify: `app/globals.css:1278-1301`
- Modify: `app/globals.css:1397-1470`

**Interfaces:**
- Consumes: `mediaFrameClass`, `mediaObjectClass`, and `mediaSizes` from Task 1.
- Produces: one public hero geometry shared by hero image, reduced-motion poster, and active video; responsive category/occasion/maker editorial frames.

- [ ] **Step 1: Add failing homepage regressions**

In `tests/responsive-media-public.test.ts` and the existing hero tests, assert:

```ts
assert.match(hero, /data-media-frame="cover"/);
assert.equal((hero.match(/data-media-mode="cover"/g) ?? []).length, 3);
assert.match(hero, /mediaObjectClass\('cover'/);
assert.match(hero, /loading=\{index === 0 \? 'eager' : 'lazy'\}/);
assert.match(hero, /poster=\{posterUrl\}/);
assert.match(hero, /preload=\{index === current \? 'metadata' : 'none'\}/);
assert.match(hero, /prefers-reduced-motion: reduce/);
assert.match(occasion, /sizes=\{mediaSizes\.occasion\}/);
assert.match(homepage, /sizes=\{mediaSizes\.editorial\}/);
assert.match(homepage, /data-media-mode="cover"/);
```

Also assert the exact public URL remains `` `/api/homepage/hero-media/${encodeURIComponent(slide.mediaId)}` `` and the poster URL keeps the same route.

- [ ] **Step 2: Run homepage tests and verify RED**

Run:

```powershell
npx tsx --test tests/responsive-media-public.test.ts tests/homepage-hero-presentation.test.ts tests/homepage-hero-carousel.test.ts tests/homepage-occasion-carousel.test.ts
```

Expected: responsive-contract assertions fail while the existing autoplay/accessibility assertions still pass.

- [ ] **Step 3: Apply one cover frame to every hero state**

Import Task 1 helpers. Mark the existing media wrapper `data-media-frame="cover"` and build its classes with `mediaFrameClass('cover', ...)`. Apply `data-media-mode="cover"` and `mediaObjectClass('cover', existing visual filters)` to both raw images and the `<video>`. Keep the `videos` ref map, `onEnded`, `muted`, `playsInline`, `poster`, `preload`, loading behavior, alt/description values, and reduced-motion conditional unchanged.

Use a reserved mobile/tablet geometry on the wrapper:

```tsx
className={mediaFrameClass(
  'cover',
  'aspect-[4/3] min-h-0 bg-[#75695f] sm:aspect-[8/5] lg:aspect-auto lg:min-h-[clamp(32rem,42vw,40rem)]',
)}
```

Change the outer slide from a mobile `min-h-[36rem]` to `min-h-0 lg:min-h-[36rem]` so the stacked copy and media do not inherit desktop-only minimum geometry.

- [ ] **Step 4: Migrate occasion, category, and maker media**

Use `cover` for the occasion pattern, category circles, and maker workshop. Keep decorative `alt=""` on the pattern and meaningful current alt text on category/maker images. Replace literal `sizes` with `mediaSizes.occasion` and `mediaSizes.editorial`; retain the bounded category size. Put `data-media-frame="cover"` on each relative wrapper and `data-media-mode="cover"` on each image.

Update only the frame sizing CSS: use `clamp()` for hero/maker heights, keep wide-screen maximum content widths, and retain existing breakpoint-specific focal `object-position`. Correct the hero focal selectors from `.homepage-hero-media img` to `.homepage-hero-media`, because the class belongs to the image/video element itself. Do not remove internal category scrolling or carousel overflow containment.

- [ ] **Step 5: Run homepage tests and verify GREEN**

Run the command from Step 2.

Expected: PASS, including existing carousel pause, keyboard, video, and reduced-motion tests.

- [ ] **Step 6: Commit homepage/editorial migration**

```powershell
git add app/globals.css app/page.tsx components/homepage/homepage-hero-carousel.tsx components/homepage/homepage-occasion-carousel.tsx tests/homepage-hero-presentation.test.ts tests/homepage-hero-carousel.test.ts tests/responsive-media-public.test.ts
git commit -m "feat: make homepage media responsive"
```

---

### Task 3: Catalogue cards, shop, maker, and product gallery

**Files:**
- Modify: `tests/responsive-media-public.test.ts`
- Modify: `tests/product-gallery.test.ts`
- Modify: `components/catalog/product-card.tsx`
- Modify: `components/catalog/product-slider.tsx`
- Modify: `components/catalog/recently-viewed.tsx`
- Modify: `components/catalog/product-gallery.tsx`
- Modify: `app/shop/page.tsx:184-207`
- Modify: `app/makers/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1 helpers and `mediaSizes.productSlider`, `productGrid`, `shopGrid`, `productGallery`, `galleryThumbnail`, and `makerGrid`.
- Produces: `ProductCard({ product, sizes?: string })`; cover catalogue cards/thumbnails; contained primary gallery image and demonstration video.

- [ ] **Step 1: Write failing catalogue/gallery tests**

Extend `tests/product-gallery.test.ts` to require the rendered main image to carry `data-media-mode="contain"`, thumbnails to carry `cover`, and MP4 video to carry `contain`, `controls`, `muted`, `playsinline`, `preload="metadata"`, and a reserved `aspect-video` frame. Extend `tests/responsive-media-public.test.ts` with:

```ts
assert.match(productCard, /sizes = mediaSizes\.productGrid/);
assert.match(productSlider, /sizes=\{mediaSizes\.productSlider\}/);
assert.match(recentlyViewed, /sizes=\{mediaSizes\.productGrid\}/);
assert.match(shop, /sizes=\{mediaSizes\.shopGrid\}/);
assert.match(maker, /sizes=\{mediaSizes\.makerGrid\}/);
assert.match(gallery, /sizes=\{mediaSizes\.productGallery\}/);
assert.match(gallery, /sizes=\{mediaSizes\.galleryThumbnail\}/);
```

Assert all dynamic sources remain `/api/product-media/` plus the existing media ID and all meaningful alt expressions remain unchanged.

- [ ] **Step 2: Run catalogue tests and verify RED**

Run:

```powershell
npx tsx --test tests/responsive-media-public.test.ts tests/product-gallery.test.ts tests/recently-viewed.test.ts tests/homepage-products.test.ts
```

Expected: new mode/size assertions fail; current gallery count and recently-viewed behavior pass.

- [ ] **Step 3: Make ProductCard layout-aware without duplicating markup**

Change the signature to:

```ts
export function ProductCard({
  product,
  sizes = mediaSizes.productGrid,
}: {
  product: FeaturedProduct;
  sizes?: string;
})
```

Use a `cover` frame on its existing `aspect-[4/5]` wrapper and pass `sizes={sizes}` to `Image`. `ProductSlider` passes `mediaSizes.productSlider`; `RecentlyViewed` passes `mediaSizes.productGrid`. Keep links, badges, hover transforms, pricing, and wishlist/history behavior unchanged.

- [ ] **Step 4: Migrate shop and maker grids**

Apply `cover` mode, stable `aspect-[4/5]` frames, and their named `sizes` constants. Use `mediaSizes.shopGrid` for the shop's two-column mobile layout, `mediaSizes.makerGrid` for maker pages, and retain `mediaSizes.productGrid` for one-column mobile ProductCard consumers such as recently viewed. Reformat `app/makers/[id]/page.tsx` from its one-line JSX so the mode/frame contract is reviewable; do not change data loading, links, product copy, or money formatting.

- [ ] **Step 5: Migrate gallery images and videos**

Use `contain` for the aspect-square main image and product demonstration; use `cover` for square thumbnails. Give every frame `data-media-frame`, retain the current active-index state and button labels, pass `sizes={mediaSizes.productGallery}` to the main `Image`, pass `sizes={mediaSizes.galleryThumbnail}` to thumbnail images, and use:

```tsx
<video
  data-media-mode="contain"
  controls
  muted
  playsInline
  preload="metadata"
  className={mediaObjectClass('contain', 'aspect-video max-h-96 rounded-2xl border bg-black')}
  aria-label={'Product demonstration of ' + productName}
  src={'/api/product-media/' + video.id}
>
```

Do not add autoplay or change the fallback text/caption.

- [ ] **Step 6: Run catalogue tests and verify GREEN**

Run the Step 2 command.

Expected: PASS with gallery selection/count, URLs, accessible names, and video controls unchanged.

- [ ] **Step 7: Commit the catalogue migration**

```powershell
git add app/shop/page.tsx 'app/makers/[id]/page.tsx' components/catalog/product-card.tsx components/catalog/product-slider.tsx components/catalog/recently-viewed.tsx components/catalog/product-gallery.tsx tests/product-gallery.test.ts tests/responsive-media-public.test.ts
git commit -m "feat: make catalogue media responsive"
```

---

### Task 4: Customer media, QR, branding, footer, and 404

**Files:**
- Create: `tests/responsive-media-account.test.ts`
- Modify: `components/commerce/cart-view.tsx:148-167`
- Modify: `components/account/saved-product-grid.tsx:13-32`
- Modify: `components/commerce/review-attachments.tsx`
- Modify: `components/commerce/document-machine-codes.tsx`
- Modify: `components/layout/site-header.tsx:37-55`
- Modify: `components/layout/site-footer.tsx:79-95`
- Modify: `app/not-found.tsx:67-79`
- Modify: `app/staff-access-denied/page.tsx:18-23`
- Modify: `app/seller-access-denied/page.tsx:12-17`
- Modify: `tests/not-found-page.test.ts`

**Interfaces:**
- Consumes: Task 1 modes plus `savedProduct`, `cartThumbnail`, `reviewAttachment`, and `notFound` sizes.
- Produces: cover commerce thumbnails, contained user/document media, natural footer lockup, and shrink-safe brand marks/QR.

- [ ] **Step 1: Write failing account/shared-surface tests**

Create source tests that require:

```ts
assert.match(cart, /data-media-mode="cover"/);
assert.match(cart, /sizes=\{mediaSizes\.cartThumbnail\}/);
assert.match(saved, /sizes=\{mediaSizes\.savedProduct\}/);
assert.match(reviews, /data-media-mode="contain"/);
assert.match(reviews, /loading="lazy"/);
assert.match(qr, /data-media-mode="contain"/);
assert.match(qr, /sizes=\{mediaSizes\.qr\}/);
assert.match(qr, /media-shrink/);
assert.match(footer, /data-media-mode="natural"/);
assert.match(footer, /sizes=\{mediaSizes\.footerLogo\}/);
assert.match(notFound, /sizes=\{mediaSizes\.notFound\}/);
```

Assert the QR remains `192 × 192`, review links retain `target="_blank"` and `rel="noopener noreferrer"`, cart/wishlist URLs remain `/api/product-media/`, and current alt text remains unchanged. Extend the rendered 404 test to require the decorative image to remain `alt=""`, priority-loaded, and cover-mode.

- [ ] **Step 2: Run account/shared tests and verify RED**

Run:

```powershell
npx tsx --test tests/responsive-media-account.test.ts tests/not-found-page.test.ts tests/footer-presentation.test.ts tests/site-header-auth.test.ts
```

Expected: new responsive assertions fail; existing privacy-safe 404/header/footer behavior passes.

- [ ] **Step 3: Migrate customer commerce media**

Keep cart and saved-product imagery as `cover` in their existing 4:5 and 4:3 reserved frames, pass `sizes={mediaSizes.cartThumbnail}` and `sizes={mediaSizes.savedProduct}`, and retain empty cart alt text where the link already supplies the accessible name. Render customer review photos in a 96 px reserved square with `contain` and `sizes={mediaSizes.reviewAttachment}` so the full attachment remains visible; retain lazy loading, new-tab behavior, and meaningful alt text.

- [ ] **Step 4: Make machine codes and logos shrink-safe**

Keep the QR intrinsic `width={192}` and `height={192}`, use `contain`, add `sizes={mediaSizes.qr}`, and add `media-shrink mx-auto size-48`; do not alter its locally generated data URI or barcode SVG. Use `contain` plus `mediaSizes.brandMark` for header/access-denied brand marks and `natural` plus `mediaSizes.footerLogo` for the footer lockup, preserving current alt/decorative semantics and priority only on the header mark.

- [ ] **Step 5: Make 404 art fluid without changing recovery content**

Use `mediaFrameClass('cover', 'min-h-[clamp(18rem,72vw,29rem)] ... lg:min-h-[clamp(29rem,36vw,34rem)]')`, `mediaSizes.notFound`, and `mediaObjectClass('cover', 'opacity-35')`. Do not alter its privacy-safe copy, destinations, decorative overlay, or icons.

- [ ] **Step 6: Run account/shared tests and verify GREEN**

Run the Step 2 command.

Expected: PASS, including the existing 404 and layout behavior.

- [ ] **Step 7: Commit customer/shared migration**

```powershell
git add components/commerce/cart-view.tsx components/account/saved-product-grid.tsx components/commerce/review-attachments.tsx components/commerce/document-machine-codes.tsx components/layout/site-header.tsx components/layout/site-footer.tsx app/not-found.tsx app/staff-access-denied/page.tsx app/seller-access-denied/page.tsx tests/not-found-page.test.ts tests/responsive-media-account.test.ts
git commit -m "feat: make customer media responsive"
```

---

### Task 5: Seller upload previews and operational media

**Files:**
- Create: `tests/responsive-media-operations.test.ts`
- Modify: `components/seller/product-submission-form.tsx:114-317`
- Modify: `app/seller/products/page.tsx:203-224`
- Modify: `app/seller/layout.tsx:23-39`

**Interfaces:**
- Consumes: Task 1 modes and `mediaSizes.adminThumbnail` for bounded operational thumbnails.
- Produces: cover image previews backed by current object URLs/API URLs and contain video previews backed by current validation/storage paths.

- [ ] **Step 1: Write failing seller/operational tests**

Require both current CSS-background previews to be absent and explicit image/video modes to exist:

```ts
assert.doesNotMatch(form, /backgroundImage/);
assert.equal((form.match(/data-media-mode="cover"/g) ?? []).length, 2);
assert.match(form, /data-media-mode="contain"[\s\S]*?<video|<video[\s\S]*?data-media-mode="contain"/);
assert.match(form, /controls/);
assert.match(form, /preload="metadata"/);
assert.match(form, /URL\.createObjectURL/);
assert.match(form, /URL\.revokeObjectURL/);
assert.match(form, /\/api\/product-media\/\$\{media\.id\}/);
assert.match(sellerProducts, /data-media-mode="cover"/);
assert.match(sellerLayout, /data-media-mode="contain"/);
```

Also load the seller create/update routes and validator modules as source and assert accepted MIME lists, `validateProductImage`, `validateProductImageContent`, and `validateProductVideo` calls remain present.

- [ ] **Step 2: Run operational tests and verify RED**

Run:

```powershell
npx tsx --test tests/responsive-media-operations.test.ts tests/product-form-render.test.ts tests/product-form-consolidated.test.ts tests/product-video.test.ts tests/rider-media.test.ts tests/rider-media-access.test.ts
```

Expected: preview-mode assertions fail; existing upload validation/security tests pass.

- [ ] **Step 3: Replace dynamic background previews with responsive images**

In `ImageUploadSlot` and `ExistingImageEditor`, keep the `aspect-[4/3]` wrappers but mark them as cover frames and render raw `<img>` elements because sources may be browser object URLs or authenticated media routes:

```tsx
<img
  data-media-mode="cover"
  src={preview}
  alt="Selected product preview"
  className={mediaObjectClass('cover')}
/>
```

For the existing/replacement variant, use `src={preview ?? `/api/product-media/${media.id}`}` and an alt value that distinguishes replacement preview from the saved original. Keep object URL creation/revocation and all file-input names/accept values unchanged.

- [ ] **Step 4: Contain seller videos and cover inventory thumbnails**

Give video previews a reserved `aspect-video` black frame and `contain` mode; keep controls, muted, and metadata preload. Apply cover mode to the seller inventory thumbnail and contain mode to the seller workspace brand mark. Do not change table behavior, seller authorization, product status logic, upload request bodies, or media routes.

- [ ] **Step 5: Run operational tests and verify GREEN**

Run the Step 2 command.

Expected: PASS, with every existing upload validator and private media access test still green.

- [ ] **Step 6: Commit seller/operational migration**

```powershell
git add components/seller/product-submission-form.tsx app/seller/products/page.tsx app/seller/layout.tsx tests/responsive-media-operations.test.ts
git commit -m "feat: make seller media previews responsive"
```

---

### Task 6: Super Admin previews and repository-wide enforcement

**Files:**
- Modify: `tests/responsive-media-operations.test.ts`
- Create: `tests/responsive-media-policy.test.ts`
- Modify: `components/admin/homepage-hero-preview.tsx`
- Modify: `app/admin/homepage/page.tsx:159-176`
- Modify: `app/admin/products/page.tsx:25-39`
- Modify: `app/admin/products/[id]/page.tsx:90-118`
- Modify: `app/admin/layout.tsx:22-38`
- Modify: `tests/admin-presentation.test.ts`

**Interfaces:**
- Consumes: Task 1 contract/scanner and all migrated render sites from Tasks 2–5.
- Produces: public-equivalent Super Admin crop/contain behavior and a zero-allowlist repository policy gate.

- [ ] **Step 1: Write failing Super Admin preview tests**

Assert image and video preview states both use `cover`, the wrapper reserves the same mobile/desktop geometry as the public hero, and the authenticated URLs remain unchanged. Assert `poster={posterUrl}`, `muted`, `loop`, `autoPlay`, `playsInline`, and the current video accessible description remain present.

For product review, require image files to render as contained images and `video/mp4` to render as a contained `<video controls muted playsInline preload="metadata">`; assert both use the existing `/api/product-media/${media.id}` route. Require admin list/homepage thumbnails to use cover and the operations logo to use contain.

- [ ] **Step 2: Add the repository-wide policy test and verify RED**

Create `tests/responsive-media-policy.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanResponsiveMediaRenderSites } from './helpers/responsive-media-policy';

void test('every production TSX media render site follows the responsive contract', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const violations = await scanResponsiveMediaRenderSites(root);
  assert.deepEqual(
    violations,
    [],
    violations.map((item) => `${item.file}:${item.line} ${item.rule}`).join('\n'),
  );
});
```

Run: `npx tsx --test tests/responsive-media-policy.test.ts tests/responsive-media-operations.test.ts`

Expected: FAIL on the remaining admin render sites. There is no legacy allowlist.

- [ ] **Step 3: Migrate homepage and product-management previews**

Use the same cover helper/class geometry in `HomepageHeroPreview` for its image, video, and poster-bearing state. In the admin product detail, branch on `media.mimeType === 'video/mp4'` so MP4 is never passed to `Image`; use `contain` for the full review asset, because moderation must see the whole product image/video, while compact list/homepage thumbnails remain `cover` with `sizes={mediaSizes.adminThumbnail}`.

- [ ] **Step 4: Complete the repository audit**

Run:

```powershell
rg -n --glob 'app/**/*.tsx' --glob 'components/**/*.tsx' '<(Image|img|video)\b|backgroundImage' .
npx tsx --test tests/responsive-media-policy.test.ts
```

Expected: the `rg` inventory contains only explicit contract sites; the policy test reports zero violations. Inspect every hit rather than reducing scope or adding an allowlist. The Leaflet static CSS sprites in `components/delivery/map.css` are outside the TSX/upload-media policy and remain unchanged.

- [ ] **Step 5: Run all focused media tests and verify GREEN**

Run:

```powershell
npx tsx --test tests/responsive-media-contract.test.ts tests/responsive-media-public.test.ts tests/responsive-media-account.test.ts tests/responsive-media-operations.test.ts tests/responsive-media-policy.test.ts tests/homepage-hero-presentation.test.ts tests/homepage-hero-carousel.test.ts tests/homepage-occasion-carousel.test.ts tests/product-gallery.test.ts tests/not-found-page.test.ts
```

Expected: PASS with no policy violations and no carousel/gallery/admin regression.

- [ ] **Step 6: Commit Super Admin migration and enforcement**

```powershell
git add components/admin/homepage-hero-preview.tsx app/admin/homepage/page.tsx app/admin/products/page.tsx 'app/admin/products/[id]/page.tsx' app/admin/layout.tsx tests/admin-presentation.test.ts tests/responsive-media-operations.test.ts tests/responsive-media-policy.test.ts
git commit -m "test: enforce responsive media policy"
```

---

### Task 7: Full verification and local-staging browser QA

**Files:**
- Create: `docs/testing/site-wide-responsive-media-self-test.md`
- Modify only if a verified mismatch is found: the owning responsive-media source/test files from Tasks 1–6.

**Interfaces:**
- Consumes: completed branch, local-staging guards/fixtures, representative routes, the six specified browser-matrix sizes, and the 320 px acceptance boundary.
- Produces: final automated gate results, screenshots under `.staging/artifacts/responsive-media/`, and a committed route-by-route mismatch ledger.

- [ ] **Step 1: Run the complete non-browser verification gates**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all tests pass, TypeScript exits `0`, lint exits `0`, and the local production-mode compilation completes. A build is not a deployment and must not use production bindings.

- [ ] **Step 2: Start only the guarded local-staging environment**

In PowerShell, use the existing isolated staging values and guard:

```powershell
$env:HASTABAZAAR_RUNTIME_ENV='local_staging'
$env:NODE_ENV='development'
$env:APP_ORIGIN='http://localhost:3000'
$env:HASTABAZAAR_MAIL_MODE='capture'
$env:HASTABAZAAR_PAYMENT_MODE='simulated'
$env:HASTABAZAAR_RECIPIENT_DOMAIN='local.hastabazaar.test'
$env:ORDER_EMAIL_JOB_SECRET='local-staging-only-job-secret-1234567890'
npm run staging:verify
npm run dev
```

Expected: the guard confirms loopback/local D1/R2/captured-mail/simulated-payment isolation before the server starts. Do not reset or reseed if existing fictional records already cover the routes.

- [ ] **Step 3: Prepare the QA ledger before browsing**

Create `docs/testing/site-wide-responsive-media-self-test.md` with a row for each combination of these viewports:

```text
320 × 800 acceptance boundary
360 × 800
390 × 844
768 × 1024
1024 × 768
1440 × 900
1920 × 1080
```

and these route/state groups:

```text
Homepage: image hero, reduced-motion video-poster state, active-video state, occasion carousel, maker editorial
Shop results: product cards and filters
Product detail: main image, thumbnails, demonstration video, reviews, recently viewed
Cart
Account wishlist
Seller product list and product edit/upload previews
Super Admin homepage image/video preview
Super Admin product queue and product media review
Custom 404 via /responsive-media-qa-missing-route
```

For dynamic records, navigate from the corresponding list (`/shop`, `/seller/products`, `/admin/products`) into the first suitable fictional local-staging record and write the actual resulting URL into the ledger.

- [ ] **Step 4: Execute browser checks at every viewport**

Use the local browser and `/local-testing` role switcher only. At each row, record:

```js
({
  viewport: [window.innerWidth, window.innerHeight],
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  overflowingMedia: [...document.querySelectorAll('img,video')]
    .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
    .map((node) => ({ tag: node.tagName, src: node.currentSrc || node.getAttribute('src') })),
  mediaModes: [...document.querySelectorAll('img,video')]
    .map((node) => node.getAttribute('data-media-mode')),
})
```

Expected: `pageOverflow` is `false`, `overflowingMedia` is empty, and every production media element has a valid mode. Visually inspect crop/contain behavior, reserved space before/after load, controls/captions/focus, and touch/keyboard reachability. Capture screenshots to `.staging/artifacts/responsive-media/`; do not commit binary screenshots.

- [ ] **Step 5: Exercise interaction, reduced-motion, network, and future-upload inheritance**

On the homepage, traverse every slide, pause/play, keyboard arrows, hover/focus pauses, and video end behavior. Emulate `prefers-reduced-motion: reduce` and confirm the poster occupies the identical frame without video playback. In local Super Admin preview, compare image/video crop to public cover behavior. In seller edit, select portrait, landscape, and square local fixture images plus an accepted MP4 and confirm the preview frame changes neither validator nor upload destination.

Inspect the browser console and network log for relevant errors, failed media requests, and duplicate image/video downloads caused solely by breakpoint changes. Confirm offscreen images remain lazy and only current/critical hero media is eager. If no valid local-staging hero MP4 exists, create a two-second solid-colour QA-only MP4 under `.staging/artifacts/responsive-media/`, upload it through the existing validated Super Admin route, exercise the local-only state, and restore the prior local hero version through the normal version workflow; never add the fixture to `public/`, catalogue records, or production.

- [ ] **Step 6: Fix mismatches with a fresh RED/GREEN cycle**

For each mismatch, first add a focused automated regression to the owning `responsive-media-*.test.ts`, observe it fail, make the smallest source change, rerun the focused test, then repeat only the affected browser rows. Record the final result or a concrete unresolved blocker in the ledger; do not mark unchecked rows as passing.

- [ ] **Step 7: Re-run final gates and inspect the branch**

Run:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
git status --short
git log --oneline --decorate -8
git merge-base --is-ancestor 537f009 HEAD; if ($LASTEXITCODE -ne 0) { throw 'design commit lost' }
git merge-base --is-ancestor 61c1422 HEAD; if ($LASTEXITCODE -ne 0) { throw 'required ancestor lost' }
```

Expected: all gates pass, no whitespace errors, only intended final documentation/fixes remain, and both required ancestors are still present.

- [ ] **Step 8: Commit verification evidence**

```powershell
git add docs/testing/site-wide-responsive-media-self-test.md
git add app components lib tests
git commit -m "docs: record responsive media verification"
```

If Step 6 produced no source changes, the second `git add` is harmless. Do not add `.staging` screenshots or generated local media.

---

## Acceptance Traceability

| Approved requirement | Owning task/gate |
| --- | --- |
| Entire customer/account/seller/rider/staff/Super Admin surface inventory | File Map audit; Tasks 2–6; Task 7 route matrix |
| Existing and future uploads inherit responsive behavior | Surface-owned contract in Tasks 2–6; seller future-upload browser check in Task 7 |
| `cover`, `contain`, and `natural` by purpose | Task 1 typed contract; per-surface mode assertions in Tasks 2–6 |
| Aspect ratio, reserved space, no page overflow | Shared frames in Task 1; component migrations; DOM/browser checks in Task 7 |
| Accurate `sizes`, priority, lazy loading, conservative video preload | Tasks 2–6 tests; Task 7 network inspection |
| Authorization, validation, storage, privacy unchanged | Global constraints; exact URL/source assertions; validator/private-access suites in Tasks 2–6 |
| Accessibility, controls, carousel/gallery, reduced motion preserved | Existing and expanded tests in Tasks 2, 3, 6; interaction QA in Task 7 |
| Automated future-render-site policy | AST engine in Task 1; zero-violation repository gate in Task 6 |
| Phone/tablet/compact desktop/desktop/wide desktop QA | Six specified viewports plus the 320 px acceptance boundary in Task 7 |
| Homepage/shop/product/cart/account/seller/Super Admin/404 routes | Route/state matrix in Task 7 |
| Focused tests, full tests, TypeScript, lint, build, mismatch ledger | Task 7 final gates and committed self-test document |
| Local staging only; production unverified/unapproved | Global constraints, guarded startup, no deploy/migration steps |
