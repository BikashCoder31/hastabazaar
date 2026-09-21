# Homepage Hero Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static homepage hero with a staging-safe, accessible carousel whose initial three slides—including the present first slide—can be edited, reordered, scheduled, previewed, and published by an authorized Super Admin without code changes.

**Architecture:** Add `homepage_hero_slides` to the existing versioned Business Settings registry and keep it as the sole publication truth. Store validated hero assets in an additive media registry backed by the existing environment-specific media abstraction. Server-render the effective first slide, then hydrate the existing Embla component for navigation, autoplay, video lifecycle, and accessibility. The current hero remains in code only as a recovery presentation when effective configuration is absent or corrupt.

**Tech Stack:** Next.js/Vinext, React 19, TypeScript, Embla Carousel, Cloudflare-compatible D1/R2 abstractions, MariaDB deployment artifacts, Sharp, Node test runner, existing Super Admin permissions and Business Settings APIs.

**Spec:** `docs/superpowers/specs/2026-09-21-homepage-hero-carousel-design.md`

## Global Constraints

- Work only in the disposable local staging environment. Do not run migrations against production, change production bindings, publish live content, or deploy.
- Keep D1-compatible and Babal/MariaDB paths. Do not remove R2/media compatibility.
- Seed exactly three editable slides and support three through eight enabled slides.
- Slide 1 is editable, reorderable, disableable, and removable under the same publication rules as slides 2–8.
- Preserve `/admin/homepage` product visibility behavior and existing homepage content below the hero.
- Do not add hosted video links, external media providers, paid services, arbitrary SQL, executable formulas, or a production bypass.
- All server mutations require trusted-origin validation, bounded input, current permissions, and server-side validation.
- Generated slide assets must depict no identifiable real maker and make no unsupported provenance claim.

## Review Focus

- Confirm that configuration is the publication source of truth and media rows cannot publish themselves.
- Confirm that the public media route cannot expose draft, archived, or orphaned uploads.
- Confirm that invalid effective configuration falls back to one stable recovery hero and never a broken carousel.
- Confirm that time-based and restored versions do not rewrite prior versions.
- Confirm that reduced motion, focus, visibility, pause, keyboard, touch, and video-ending behavior are deterministic.
- Confirm that changing slide 1 requires no code edit or redeploy.

---

## File Map

### New files

- `lib/homepage/hero-slides.ts` — types, recovery/default data, strict validation, URL allowlist, and effective-value resolution.
- `lib/homepage/hero-media.ts` — image normalization, MP4 inspection, size/dimension/duration checks, and media metadata.
- `lib/homepage/mp4-metadata.ts` — bounded ISO-BMFF parser for MP4 `mvhd` duration; no new runtime dependency.
- `lib/db/repositories/homepage-hero.ts` — media registry mutations and public/admin access checks.
- `drizzle/0055_homepage_hero_carousel.sql` — additive D1/SQLite-compatible media registry and three system asset rows.
- `deployment/babal/mariadb-homepage-hero-carousel.sql` — equivalent additive MariaDB migration.
- `app/api/admin/homepage/hero-media/route.ts` — authorized upload and list endpoint.
- `app/api/admin/homepage/hero-media/[id]/route.ts` — authenticated draft preview and archive endpoint.
- `app/api/homepage/hero-media/[id]/route.ts` — public endpoint limited to current effective references.
- `components/admin/homepage-hero-manager.tsx` — eight-slot editor, validation summary, media controls, preview, and version actions.
- `components/admin/homepage-hero-preview.tsx` — responsive draft preview shared by admin screen modes.
- `components/homepage/homepage-hero-carousel.tsx` — client carousel, controls, announcements, and media lifecycle.
- `lib/homepage/hero-autoplay.ts` — pure timing/state helpers for deterministic tests.
- `public/homepage/maker-hands-hero.webp` — fictional, face-free slide 2 image.
- `public/homepage/meaningful-gifts-hero.webp` — fictional still-life slide 3 image.
- `tests/homepage-hero-settings.test.ts` — configuration and recovery tests.
- `tests/homepage-hero-repository.test.ts` — media registry and effective-reference tests.
- `tests/homepage-hero-media.test.ts` — file validation and MP4 parser tests.
- `tests/homepage-hero-routes.test.ts` — permissions and public/private serving tests.
- `tests/homepage-hero-carousel.test.ts` — autoplay and selection state tests.
- `scripts/verify-homepage-carousel.mjs` — desktop/mobile interaction and screenshot verification.
- `docs/testing/homepage-hero-carousel-self-test.md` — local Super Admin and customer test checklist.

### Modified files

- `lib/configuration/types.ts` — register the new setting and value type.
- `lib/configuration/definitions.ts` — register the public-content definition and validator.
- `lib/configuration/capabilities.ts` — apply the complete-slide publication gate without blocking incomplete saved drafts.
- `lib/db/repositories/business-settings.ts` — expose a read-only version lookup for database-backed publication preflight.
- `app/api/admin/business-settings/changes/[id]/route.ts` — verify referenced hero media before publish/approval.
- `app/admin/homepage/page.tsx` — load and render the hero manager above product controls.
- `app/page.tsx` — resolve effective slides and render the carousel.
- `app/globals.css` — responsive carousel/preview styling and reduced-motion states.
- `tests/business-settings.test.ts` — require the new key and metadata.
- `tests/business-settings-repository.test.ts` — future-effective and restore behavior for slides.
- `tests/homepage-hero-presentation.test.ts` — update the static-hero assertions.
- `tests/admin-presentation.test.ts` — verify the new panel and permission boundary.
- `deployment/babal/release-manifest.json` — register migration hash and required columns.

---

## Task 1: Add the typed slide configuration and recovery model

**Files:**

- Create: `lib/homepage/hero-slides.ts`
- Modify: `lib/configuration/types.ts`
- Modify: `lib/configuration/definitions.ts`
- Modify: `lib/configuration/capabilities.ts`
- Modify: `tests/business-settings.test.ts`
- Create: `tests/homepage-hero-settings.test.ts`

- [ ] **Step 1: Write failing tests for the setting registry and exact three-slide default**

Add assertions that:

```ts
const definition = getBusinessSettingDefinition('homepage_hero_slides');
assert.equal(definition.changeControl, 'simple');
assert.equal(definition.effectiveMode, 'effective_dated');
assert.equal(definition.defaultValue.length, 3);
assert.equal(definition.defaultValue[0].headingLead, 'Handmade today');
assert.equal(definition.defaultValue[0].mediaId, 'system-nepal-craft-hero');
```

Add draft-validation cases showing incomplete text/media may be saved while unknown fields, more than eight cards, duplicate/gapped positions, duplicate IDs, control characters, oversized values, and unsafe paths are rejected immediately. Add publication-readiness cases accepting 3 and 8 enabled complete slides and rejecting 0–2, 9, incomplete secondary action pairs, incomplete text, and image/video field mismatches.

- [ ] **Step 2: Run the focused tests and confirm the red state**

Run:

```powershell
npx tsx --test tests/homepage-hero-settings.test.ts tests/business-settings.test.ts
```

Expected: failure because `homepage_hero_slides` and its validator do not exist.

- [ ] **Step 3: Define immutable configuration types**

Add these public contracts in `lib/homepage/hero-slides.ts` and re-export/use them from `lib/configuration/types.ts`:

```ts
export type HomepageHeroMediaType = 'image' | 'video';

export type HomepageHeroSlide = Readonly<{
  id: string;
  position: number;
  enabled: boolean;
  eyebrow: string;
  headingLead: string;
  highlightedPhrase: string | null;
  headingTail: string | null;
  body: string;
  primaryActionLabel: string;
  primaryActionHref: string;
  secondaryActionLabel: string | null;
  secondaryActionHref: string | null;
  mediaType: HomepageHeroMediaType;
  mediaId: string;
  imageAlt: string | null;
  posterMediaId: string | null;
  videoDescription: string | null;
  imageNote: string | null;
}>;

export type HomepageHeroSlides = readonly HomepageHeroSlide[];
```

Export:

```ts
export const CURRENT_HERO_RECOVERY_SLIDES: HomepageHeroSlides;
export const INITIAL_HOMEPAGE_HERO_SLIDES: HomepageHeroSlides;
export function safeHeroDestination(value: unknown): string;
export function validateHomepageHeroDraft(value: unknown): HomepageHeroSlides;
export function assertHomepageHeroPublicationReady(value: HomepageHeroSlides): HomepageHeroSlides;
```

Use fixed IDs for the three seeded slides and the three system media rows so migration, default setting, and tests agree. Keep the recovery constant separate from the editable default.

- [ ] **Step 4: Implement strict validation**

Reject unknown object keys and enforce maximum bounds while saving drafts. Permit empty required copy/media fields in a draft so work can be resumed, but never permit unsafe paths or malformed structural values. Permit only destinations beginning with `/` or `/#`; reject `//`, backslashes, control characters, credentials/protocol syntax, and the private prefixes `/admin`, `/api/admin`, `/seller`, `/rider`, `/staff`, and `/local-testing`.

Require all draft cards to use contiguous positions `1..n`; do not silently repair order on the server. `assertHomepageHeroPublicationReady` requires at least three enabled complete slides, exactly one image accessibility field set for images, and a poster plus video description for videos. Validate non-empty media IDs as server-generated safe identifiers rather than storage keys.

- [ ] **Step 5: Register the Business Setting**

Append `homepage_hero_slides` to `businessSettingKeys` and `BusinessSettingValues`. Define it as:

```ts
{
  key: 'homepage_hero_slides',
  label: 'Homepage hero slides',
  description: 'Versioned public hero content, order, actions, and media references.',
  defaultValue: INITIAL_HOMEPAGE_HERO_SLIDES,
  sensitivity: 'public_content',
  changeControl: 'simple',
  effectiveMode: 'effective_dated',
  snapshotOnTransaction: false,
  affectedSurfaces: ['public_homepage', 'admin_homepage'],
  requiredCapability: 'homepage_hero_carousel_v1',
  validate: validateHomepageHeroDraft,
}
```

In `lib/configuration/capabilities.ts`, add a `homepage_hero_slides` branch that invokes `assertHomepageHeroPublicationReady`. This preserves incomplete drafts but makes both immediate and future-effective publication fail closed.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npx tsx --test tests/homepage-hero-settings.test.ts tests/business-settings.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add lib/homepage/hero-slides.ts lib/configuration/types.ts lib/configuration/definitions.ts lib/configuration/capabilities.ts tests/business-settings.test.ts tests/homepage-hero-settings.test.ts
git commit -m "feat: define configurable homepage hero slides"
```

---

## Task 2: Add the additive media registry for D1 and MariaDB

**Files:**

- Create: `drizzle/0055_homepage_hero_carousel.sql`
- Create: `deployment/babal/mariadb-homepage-hero-carousel.sql`
- Modify: `deployment/babal/release-manifest.json`
- Create: `lib/db/repositories/homepage-hero.ts`
- Create: `tests/homepage-hero-repository.test.ts`

- [ ] **Step 1: Write failing repository and migration tests**

Create an in-memory D1-compatible fixture that loads required user/business-setting tables and `0055`. Assert that it creates:

```sql
homepage_hero_media(
  id, object_key, original_name, mime_type, size_bytes,
  width, height, duration_seconds, created_by, created_at, archived_at
)
```

Test creation, lookup, archive, refusal to archive media referenced by a retained Business Setting version, and filtering by current effective published references.

- [ ] **Step 2: Confirm the tests fail**

Run:

```powershell
npx tsx --test tests/homepage-hero-repository.test.ts
```

Expected: failure because migration and repository do not exist.

- [ ] **Step 3: Add D1 and MariaDB migrations**

Use nullable `created_by REFERENCES users(id) ON DELETE RESTRICT`: system assets use `NULL`, while uploads always record the authenticated creator. Add unique `object_key`, MIME, archive, and creation indexes. Insert the existing current-hero system row now:

```text
system-nepal-craft-hero      public/homepage/nepal-craft-hero.webp       1800×1125
```

The two remaining stable IDs already appear in the typed initial configuration, but their registry rows are added in Task 7 only after the actual generated bytes can be inspected. Intermediate Task 2 repository tests use the current hero row and uploaded fixtures; no fake size/dimension metadata is permitted.

The repository must recognize only the exact allowlisted `public/homepage/*.webp` system rows as static assets. Uploaded files always use server-generated `private/homepage-hero/<uuid>` object keys. Never accept an object key from a request.

- [ ] **Step 4: Implement the repository contract**

Export:

```ts
export type HomepageHeroMediaRecord = Readonly<{
  id: string;
  objectKey: string;
  originalName: string;
  mimeType: 'image/webp' | 'video/mp4';
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number | null;
  createdBy: string | null;
  createdAt: number;
  archivedAt: number | null;
}>;

export async function createHomepageHeroMedia(
  database: D1Database,
  input: Omit<HomepageHeroMediaRecord, 'archivedAt'>,
): Promise<HomepageHeroMediaRecord>;
export async function listHomepageHeroMediaForAdmin(
  database: D1Database,
): Promise<readonly HomepageHeroMediaRecord[]>;
export async function getHomepageHeroMediaForAdmin(
  database: D1Database,
  id: string,
): Promise<HomepageHeroMediaRecord | null>;
export async function getPublishedHomepageHeroMedia(
  database: D1Database,
  id: string,
  at: number,
): Promise<HomepageHeroMediaRecord | null>;
export async function archiveHomepageHeroMedia(
  database: D1Database,
  input: { id: string; actorId: string; reason: string; requestId: string; now: number },
): Promise<void>;
export async function assertHomepageHeroMediaReady(
  database: D1Database,
  slides: HomepageHeroSlides,
): Promise<void>;
```

`getPublishedHomepageHeroMedia` must resolve the current effective `homepage_hero_slides` value and return a record only when the ID is the active image or active video/poster reference.

- [ ] **Step 5: Register the MariaDB artifact**

Compute the migration SHA-256 with PowerShell:

```powershell
(Get-FileHash deployment/babal/mariadb-homepage-hero-carousel.sql -Algorithm SHA256).Hash.ToLowerInvariant()
```

Add that exact hash and all required media-table columns to `deployment/babal/release-manifest.json`.

- [ ] **Step 6: Run repository and manifest tests**

Run:

```powershell
npx tsx --test tests/homepage-hero-repository.test.ts tests/homepage-products.test.ts
```

- [ ] **Step 7: Commit Task 2**

```powershell
git add drizzle/0055_homepage_hero_carousel.sql deployment/babal/mariadb-homepage-hero-carousel.sql deployment/babal/release-manifest.json lib/db/repositories/homepage-hero.ts tests/homepage-hero-repository.test.ts
git commit -m "feat: add homepage hero media registry"
```

---

## Task 3: Implement bounded image and MP4 validation

**Files:**

- Create: `lib/homepage/mp4-metadata.ts`
- Create: `lib/homepage/hero-media.ts`
- Create: `tests/homepage-hero-media.test.ts`

- [ ] **Step 1: Add failing image and video fixture tests**

Cover:

- JPEG, PNG, and WebP decoded content accepted when declaration matches;
- spoofed MIME, malformed bytes, more than 8 MB image input, more than 20 MB video input, excessive dimensions, and excessive pixel count rejected;
- normalized image is WebP, no EXIF metadata survives, and dimensions are reported;
- MP4 `ftyp` and `mvhd` duration parsed with 32-bit and 64-bit box lengths;
- malformed/nested-overflow MP4 and duration above 15 seconds rejected.

Use generated in-memory fixtures; do not copy production media.

- [ ] **Step 2: Confirm the red state**

Run:

```powershell
npx tsx --test tests/homepage-hero-media.test.ts
```

- [ ] **Step 3: Implement a bounded MP4 duration parser**

Export:

```ts
export function readMp4DurationSeconds(bytes: Uint8Array): number;
```

Walk boxes with integer overflow and bounds checks. Require a recognized MP4-compatible `ftyp`, locate `moov/mvhd`, read version 0 or 1 timescale/duration, reject zero timescale, unknown duration, non-finite output, malformed nesting, and values over 15 seconds. Do not execute media or shell out to an external binary.

- [ ] **Step 4: Implement image normalization and video validation**

Export:

```ts
export type PreparedHeroMedia = Readonly<{
  bytes: Uint8Array;
  mimeType: 'image/webp' | 'video/mp4';
  width: number;
  height: number;
  durationSeconds: number | null;
  originalName: string;
}>;

export async function prepareHomepageHeroUpload(file: File): Promise<PreparedHeroMedia>;
```

Use Sharp with auto-orientation, max 2400×1600, max 20 million decoded pixels, metadata stripping, and WebP quality 84. Reject output larger than 5 MB. Validate video content independently of the browser-provided MIME. Keep the original filename only in private metadata.

- [ ] **Step 5: Run focused tests**

```powershell
npx tsx --test tests/homepage-hero-media.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add lib/homepage/mp4-metadata.ts lib/homepage/hero-media.ts tests/homepage-hero-media.test.ts
git commit -m "feat: validate homepage hero media"
```

---

## Task 4: Add authorized media upload, preview, archive, and public serving routes

**Files:**

- Create: `app/api/admin/homepage/hero-media/route.ts`
- Create: `app/api/admin/homepage/hero-media/[id]/route.ts`
- Create: `app/api/homepage/hero-media/[id]/route.ts`
- Modify: `app/api/admin/business-settings/changes/[id]/route.ts`
- Modify: `lib/db/repositories/business-settings.ts`
- Create: `tests/homepage-hero-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Assert:

- no identity, ordinary customer, seller, or rider receives media-management access;
- `business_settings.manage` is required for upload/archive and `business_settings.view` for admin preview/list;
- untrusted mutations return 403;
- multipart bodies above 22 MB return 413;
- bucket write is removed if DB creation fails;
- public route returns 404 for draft-only, orphaned, archived, and future-effective references;
- publish/approve actions reject complete-looking slides whose referenced media is missing, archived, or not owned by this hero registry;
- current effective public image/video/poster returns `nosniff`, correct content type, ETag, and bounded cache headers;
- system assets redirect or stream only from the exact static allowlist.

- [ ] **Step 2: Confirm tests fail**

```powershell
npx tsx --test tests/homepage-hero-routes.test.ts
```

- [ ] **Step 3: Implement the upload/list endpoint**

Use `readBoundedForm(request, 22 * 1024 * 1024)`, `prepareHomepageHeroUpload`, `requireStaffApi('business_settings.manage')`, `isTrustedMutationRequest`, `requireDatabase`, and `requireMediaBucket`. Generate media ID/object key server-side and clean up the object if the registry insert fails.

- [ ] **Step 4: Implement authenticated preview and archive**

`GET /api/admin/homepage/hero-media/:id` requires `business_settings.view`. `DELETE` requires `business_settings.manage`, a trusted request, a reason, and an idempotent request ID. Archive the row rather than deleting bytes; refuse archive while any retained setting version references it.

- [ ] **Step 5: Implement public serving**

Call `getPublishedHomepageHeroMedia` before accessing storage. Never accept `draft`, version, or object-key query parameters. Return 404 rather than revealing whether a private ID exists.

- [ ] **Step 6: Add database-backed publication preflight**

Export a read-only `getBusinessSettingVersionById` wrapper from the Business Settings repository. In `app/api/admin/business-settings/changes/[id]/route.ts`, before `publish` or `approve`, load the current version; when its key is `homepage_hero_slides`, run both `assertHomepageHeroPublicationReady` and `assertHomepageHeroMediaReady`. Keep the existing revision/actor checks inside the mutation function so this preflight cannot authorize a stale or unauthorized request.

- [ ] **Step 7: Run focused route/security tests**

```powershell
npx tsx --test tests/homepage-hero-routes.test.ts tests/business-settings-permissions.test.ts
```

- [ ] **Step 8: Commit Task 4**

```powershell
git add app/api/admin/homepage/hero-media app/api/homepage/hero-media app/api/admin/business-settings/changes/[id]/route.ts lib/db/repositories/business-settings.ts tests/homepage-hero-routes.test.ts
git commit -m "feat: add secure homepage hero media routes"
```

---

## Task 5: Build the Super Admin slide editor on the existing homepage controls page

**Files:**

- Create: `components/admin/homepage-hero-manager.tsx`
- Create: `components/admin/homepage-hero-preview.tsx`
- Modify: `app/admin/homepage/page.tsx`
- Modify: `tests/admin-presentation.test.ts`
- Modify: `tests/business-settings-repository.test.ts`

- [ ] **Step 1: Add failing presentation and version-flow tests**

Verify `/admin/homepage` requires `business_settings.view`, renders **Hero slides** before product controls, and exposes fields for all approved slide properties. Test explicit move up/down, add up to eight, remove/disable slide 1 when at least three enabled remain, and block publishing with fewer than three ready slides.

Add repository acceptance tests showing a scheduled hero version remains invisible until its effective time and restoring an older hero creates a later version without changing history.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx tsx --test tests/admin-presentation.test.ts tests/business-settings-repository.test.ts
```

- [ ] **Step 3: Load the workspace without weakening permissions**

Change the page guard from unrelated `admin.invite` to `business_settings.view`. Load `getEffectiveBusinessSetting(database, 'homepage_hero_slides', now)`, `listBusinessSettingHistory`, and the authorized media list in parallel. Pass serialized values to the client manager. Keep the existing product query/filter/pagination unchanged.

- [ ] **Step 4: Implement the editor state and validation summary**

The manager must:

- render the current three slides as ordinary editable cards;
- add slides until eight total;
- use generated UUIDs for new draft slide IDs;
- renumber positions only when the administrator explicitly moves or removes a draft card;
- show character counts and per-field errors;
- pair secondary label/destination fields;
- support enable/disable and explicit move controls;
- show desktop/mobile previews;
- upload/select image, video, and video poster assets;
- show a readiness summary before save/publish.

Do not include a lock, special badge, or code-only edit path for slide 1.

- [ ] **Step 5: Reuse the existing Business Settings lifecycle**

Create drafts through `POST /api/admin/business-settings` with `key: 'homepage_hero_slides'`. Use the existing version mutation routes for preview/publish/scheduling/restoration and send current revision/request IDs. Do not create a competing hero-publication API.

- [ ] **Step 6: Run focused tests**

```powershell
npx tsx --test tests/admin-presentation.test.ts tests/business-settings-repository.test.ts tests/homepage-hero-settings.test.ts
```

- [ ] **Step 7: Commit Task 5**

```powershell
git add components/admin/homepage-hero-manager.tsx components/admin/homepage-hero-preview.tsx app/admin/homepage/page.tsx tests/admin-presentation.test.ts tests/business-settings-repository.test.ts
git commit -m "feat: add super admin hero slide editor"
```

---

## Task 6: Build deterministic carousel behavior and accessibility

**Files:**

- Create: `lib/homepage/hero-autoplay.ts`
- Create: `components/homepage/homepage-hero-carousel.tsx`
- Create: `tests/homepage-hero-carousel.test.ts`

- [ ] **Step 1: Write failing pure-state tests**

Cover ordered advance/wrap, image timeout `6_000`, video hard timeout `15_000`, timer reset after manual selection, and pause reasons:

```ts
type HeroPauseReason =
  | 'manual'
  | 'hover'
  | 'focus'
  | 'document-hidden'
  | 'reduced-motion';
```

Verify automatic selection does not set announcement text while manual previous/next/dot/keyboard selection produces `Slide N of M: <heading>`.

- [ ] **Step 2: Confirm the tests fail**

```powershell
npx tsx --test tests/homepage-hero-carousel.test.ts
```

- [ ] **Step 3: Implement pure helpers**

Export `nextHeroIndex`, `heroAdvanceDelayMs`, `shouldAutoplayHero`, and `heroSelectionAnnouncement`. Keep DOM state out of this module so timers can be tested without browser globals.

- [ ] **Step 4: Implement the client carousel**

Compose the existing `Carousel`, `CarouselContent`, and `CarouselItem` with `opts={{ loop: true }}`. Add previous/next buttons, numbered dots, pause/play, swipe, and existing arrow-key handling. Use `aria-label="Featured Hastabazaar stories"`, `aria-roledescription="carousel"`, and `aria-label="Slide N of M"` on each item.

Manage autoplay in one effect so timer and video end cannot advance twice. On slide departure pause and set `currentTime = 0` for the video. Only the active video receives `preload="metadata"`; distant videos use `preload="none"`. Use `muted`, `playsInline`, no controls that expose audio autoplay, and poster output for reduced motion.

- [ ] **Step 5: Implement pause and announcement behavior**

Pause on pointer hover, focus within, hidden document, explicit visitor pause, and reduced motion. Reset the delay after any manual selection. Maintain a polite live region that changes only after manual selection; automatic rotation must be silent.

- [ ] **Step 6: Run focused tests**

```powershell
npx tsx --test tests/homepage-hero-carousel.test.ts
```

- [ ] **Step 7: Commit Task 6**

```powershell
git add lib/homepage/hero-autoplay.ts components/homepage/homepage-hero-carousel.tsx tests/homepage-hero-carousel.test.ts
git commit -m "feat: build accessible homepage hero carousel"
```

---

## Task 7: Seed two new editorial assets and integrate the effective carousel on the homepage

**Files:**

- Create: `public/homepage/maker-hands-hero.webp`
- Create: `public/homepage/meaningful-gifts-hero.webp`
- Modify: `drizzle/0055_homepage_hero_carousel.sql`
- Modify: `deployment/babal/mariadb-homepage-hero-carousel.sql`
- Modify: `deployment/babal/release-manifest.json`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/homepage-hero-presentation.test.ts`

- [ ] **Step 1: Write failing homepage presentation tests**

Assert that the page resolves `homepage_hero_slides`, passes three effective slides to `HomepageHeroCarousel`, no longer hardcodes the only visible hero in `page.tsx`, and retains the recovery content through `CURRENT_HERO_RECOVERY_SLIDES`. Assert category-panel overlap and existing anchor IDs remain.

- [ ] **Step 2: Confirm the test fails**

```powershell
npx tsx --test tests/homepage-hero-presentation.test.ts
```

- [ ] **Step 3: Generate two face-free staging assets**

Use the image-generation skill during implementation with these constraints:

1. Slide 2: close editorial view of anonymous artisan hands shaping or decorating Nepali craft; no face, logo, text, bag, or claim about a real person.
2. Slide 3: warm still life of Nepali pottery, Lokta paper, textile, and small craft objects; no bag, face, logo, or embedded text.

Inspect both outputs, crop/normalize to WebP, and add these exact rows with measured dimensions/byte sizes to both migrations:

```text
system-maker-hands-hero      public/homepage/maker-hands-hero.webp
system-meaningful-gifts-hero public/homepage/meaningful-gifts-hero.webp
```

Keep the current `nepal-craft-hero.webp` unchanged. Do not write guessed media metadata.

- [ ] **Step 4: Resolve the effective value server-side**

In `app/page.tsx`, load the effective setting with other homepage data. Call a helper that catches database/validation failures and returns:

```ts
{
  slides: CURRENT_HERO_RECOVERY_SLIDES,
  source: 'recovery',
  warning: 'Published hero configuration could not be used.'
}
```

for absent/corrupt/fewer-than-three content. Do not mix individual invalid configured slides with recovery slides.

- [ ] **Step 5: Replace the static hero with the component**

Pass the resolved slides and media URLs to `HomepageHeroCarousel`. Eager-load only the first image or video poster. Preserve the current split desktop layout, mobile stack, actions, principles, image note, and category overlap.

- [ ] **Step 6: Add responsive and reduced-motion CSS**

Use stable aspect/min-height rules to prevent layout shift. Ensure controls have 44px touch targets, visible focus, sufficient contrast, no horizontal overflow, and no transform transition under `prefers-reduced-motion: reduce`.

- [ ] **Step 7: Recompute migration hash and run focused tests**

```powershell
npx tsx --test tests/homepage-hero-settings.test.ts tests/homepage-hero-presentation.test.ts tests/homepage-hero-repository.test.ts
```

Update the release manifest hash after the final migration bytes are fixed.

- [ ] **Step 8: Commit Task 7**

```powershell
git add public/homepage/maker-hands-hero.webp public/homepage/meaningful-gifts-hero.webp drizzle/0055_homepage_hero_carousel.sql deployment/babal/mariadb-homepage-hero-carousel.sql deployment/babal/release-manifest.json app/page.tsx app/globals.css tests/homepage-hero-presentation.test.ts
git commit -m "feat: integrate configurable homepage hero slides"
```

---

## Task 8: Add end-to-end verification and the local self-test package

**Files:**

- Create: `scripts/verify-homepage-carousel.mjs`
- Create: `docs/testing/homepage-hero-carousel-self-test.md`
- Modify: `scripts/verify-homepage-editorial.mjs`

- [ ] **Step 1: Add browser verification for customer behavior**

The script must use isolated local staging and verify at desktop and mobile widths:

- exactly three initial slides;
- next/previous/dots/keyboard select correctly;
- automatic wrap after the last slide;
- hover, focus, manual pause, hidden document, and reduced motion stop rotation;
- first slide does not shift the category panel;
- no clipping, horizontal overflow, blank image, or console error;
- video fixture ends/advances and pauses/resets when leaving the slide.

Save screenshots under the existing ignored test-artifact directory, not `public/`.

- [ ] **Step 2: Document the Super Admin self-test**

Include secure local access steps and expected results for:

1. editing slide 1 text and image without code/redeploy;
2. moving slide 1 to another position;
3. adding a fourth slide and scheduling it;
4. rejecting a two-enabled-slide publication;
5. uploading valid/invalid image, MP4, and poster combinations;
6. verifying customer desktop/mobile output;
7. confirming unauthorized accounts cannot manage or preview drafts;
8. restoring a prior version as a new version;
9. confirming historical versions/media references remain intact;
10. confirming recovery behavior after a disposable-test-only corrupt fixture.

- [ ] **Step 3: Run all automated checks**

Run:

```powershell
npm test
.\node_modules\.bin\tsc.cmd --noEmit
npm run lint
npm run build
node scripts/verify-homepage-carousel.mjs
```

Record the command, date, result, screenshots, and any skipped/blocked check in the self-test document. Do not describe code inspection as browser verification.

- [ ] **Step 4: Run a production-isolation check**

Inspect effective bindings used by the local process and confirm DB, media, queue, mail, and payment references are disposable/local. Stop immediately if any production identifier appears. Record only redacted identifiers and Pass/Fail/Not Verified.

- [ ] **Step 5: Review the complete diff**

Run:

```powershell
git status --short
git diff --check
git diff HEAD~8 --stat
```

Inspect that no credentials, customer data, production backup, generated queue payload, or real agreement/company placeholder has been added.

- [ ] **Step 6: Commit Task 8**

```powershell
git add scripts/verify-homepage-carousel.mjs scripts/verify-homepage-editorial.mjs docs/testing/homepage-hero-carousel-self-test.md
git commit -m "test: verify configurable homepage hero carousel"
```

---

## Task 9: Final staging review and handoff

**Files:**

- Modify only files required by verified review findings.

- [ ] **Step 1: Compare the implementation with the approved specification**

Check every requirement in Sections 1–12 of the design spec and explicitly verify:

- slide 1 is editable through Super Admin;
- initial staging has exactly three slides;
- up to eight slides work;
- both image and video slides work;
- public serving is effective-version gated;
- recovery is safe and visible only on failure;
- product visibility controls remain functional.

- [ ] **Step 2: Request code review using the required skill**

Invoke `superpowers:requesting-code-review`, address concrete findings, and rerun any affected focused test before the full suite.

- [ ] **Step 3: Re-run completion verification using the required skill**

Invoke `superpowers:verification-before-completion` and run the full command set again. Do not claim success from earlier output.

- [ ] **Step 4: Produce the staging handoff**

Report:

- commits and files changed;
- actual test/type/lint/build/browser results;
- local URL and secure test-account delivery method;
- known limitations;
- production-only gates: verified live release/schema/runtime, storage/video capacity, backups/rollback, and final public-content approval.

Explicitly state that production deployment, production migration, real media upload, and live publication remain unapproved.
