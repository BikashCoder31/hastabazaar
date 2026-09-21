# Site-wide Responsive Media — Design Specification

**Version:** 1.0  
**Date:** 22 September 2026  
**Environment scope:** existing isolated local staging worktree  
**Production deployment:** not authorized

## 1. Approved outcome

Every customer, account, seller, rider, staff, and Super Admin surface must render images, image posters, and videos responsively from small phones through wide desktop screens. Existing media and future uploads must follow the same policy without requiring page-specific fixes after upload.

The implementation must:

- prevent media from causing horizontal page overflow;
- preserve the media's intended role and useful focal area;
- resize continuously rather than only at a few fixed viewport widths;
- avoid cumulative layout shift by reserving an appropriate media frame before loading;
- provide efficient responsive image requests where the runtime supports them;
- keep accessible alternative text and video descriptions intact;
- preserve existing upload authorization, validation, storage, publication, and privacy rules;
- preserve existing carousel, gallery, form, and playback behavior; and
- add an enforceable repository rule so future render sites cannot silently bypass the policy.

This is a presentation and rendering-system change. It does not authorize production deployment, new upload destinations, relaxed file validation, new public access to private media, or changes to catalogue records.

## 2. Media inventory and scope

The current repository contains approximately 36 image or video render sites across 25 files. The migration covers:

- homepage hero images, video posters, and videos;
- homepage product, maker, occasion, and editorial media;
- product cards, product-detail galleries, thumbnails, and demonstration videos;
- shop results, saved products, recently viewed items, cart lines, reviews, and attachments;
- the site header, footer, access-denied pages, and custom 404 page;
- seller application media, product-upload previews, saved product media, and profile media;
- rider and return evidence previews where media is rendered in the application;
- Super Admin homepage previews, product lists, product review screens, and other media previews; and
- any future render site introduced under `app/` or `components/`.

PDF downloads and files that are never rendered inline are outside the visual-responsiveness scope. If a PDF or document image is previewed inline, its preview frame is in scope and uses containment behavior.

## 3. Responsive media policy

### 3.1 Approved presentation modes

All rendered media must declare one of three purpose-based modes.

| Mode | Intended use | Behavior |
| --- | --- | --- |
| `cover` | hero media, product cards, gallery thumbnails, editorial tiles | fills a reserved frame; proportional cropping is allowed; focal positioning may change by breakpoint |
| `contain` | logos, QR codes, documents, evidence, instructional media | the complete asset remains visible; empty frame space is allowed; never crops essential content |
| `natural` | editorial or attachment media whose own proportions are the content | width is bounded by its container; height follows the intrinsic aspect ratio |

Videos additionally declare whether their frame is `cover` or `contain`. Homepage ambience may use `cover`; product demonstrations and evidence previews use `contain` unless the surrounding flow explicitly provides a non-destructive crop control.

### 3.2 Global safety baseline

The global stylesheet will provide a low-specificity media safety rule that prevents replaced elements from exceeding their containing block. This is a final overflow guard, not the primary layout mechanism. Existing utility classes and approved media-frame classes continue to control height, aspect ratio, and object fit.

No global rule may force every asset to `height: auto` when that would break fill-mode images, carousel slides, or fixed-aspect video frames.

### 3.3 Shared rendering contract

A small shared responsive-media module will expose named frame styles and typed helpers for:

- responsive aspect-ratio frames;
- `cover`, `contain`, and `natural` object-fit behavior;
- purpose-specific responsive `sizes` strings;
- bounded corner radii and frame heights using `clamp()`;
- loading-state backgrounds; and
- media that must shrink below its preferred fixed size, such as QR codes and logos.

The module will not replace framework image optimization, authorization-aware media routes, or carousel internals. Components that require refs or playback state, such as hero videos, may apply the shared contract directly rather than wrapping the element in an abstraction that obscures control.

## 4. Breakpoint and layout behavior

The implementation uses the existing Tailwind breakpoints plus fluid CSS sizing.

### 4.1 Phones: 320–639 px

- Media frames use the full available content width.
- No image, poster, video, control, caption, or media toolbar may exceed the viewport.
- Product grids render an appropriate one- or two-column layout without shrinking content below usable touch and text sizes.
- Hero and 404 art frames use shorter fluid heights while retaining their focal content.
- Galleries keep thumbnails and controls reachable without horizontal page scrolling; deliberate internal scrollers remain keyboard and touch accessible.
- Action rows stack when their labels cannot fit safely.

### 4.2 Tablets: 640–1023 px

- Large editorial compositions normally remain stacked unless the available width supports both columns without compressing text or media.
- Product and admin media grids increase columns progressively.
- Preview frames preserve useful proportions and do not inherit desktop-only minimum heights.

### 4.3 Desktop: 1024–1439 px

- Hero and editorial sections may use balanced two-column layouts.
- Media frames scale with their grid columns and reserve stable heights.
- Product gallery, cart, and management views maintain their existing information hierarchy.

### 4.4 Wide screens: 1440 px and above

- Media respects the existing content maximum widths instead of stretching indefinitely.
- Responsive image candidates account for the actual bounded display width, not the full viewport width.
- Focal positioning remains stable and decorative media does not create oversized empty areas.

## 5. Future-upload enforcement

Future media must be responsive without code changes for each upload.

### 5.1 Upload processing

Existing server-side validation remains authoritative:

- allowed MIME type and file-signature checks;
- bounded byte size and pixel count;
- image decoding, orientation normalization, metadata stripping, and safe re-encoding where already required;
- MP4 container, duration, and dimension validation where already required; and
- existing access-control and private/public object-key separation.

Where a current upload pipeline already records intrinsic width and height, those values remain authoritative. A migration is not required merely to make a media element responsive; CSS aspect frames and intrinsic element metadata provide a safe fallback for older records or private evidence without stored dimensions.

This project must not broaden accepted file types or weaken validation. Any discovered upload path that displays a preview but bypasses existing safe media preparation will be documented and brought under the nearest existing validator as part of the implementation plan.

### 5.2 Rendering inheritance

Dynamic routes such as product media, homepage hero media, review photos, and authorized evidence routes feed approved media surfaces. Because the surface owns the responsive frame, every valid future upload automatically receives the same sizing, fitting, and overflow behavior regardless of its source dimensions.

Super Admin previews must use the same presentation mode and aspect policy as the public destination. A preview may scale down, but it must not show a materially different crop rule.

### 5.3 Repository enforcement

An automated policy test will scan production TSX render sites and reject newly introduced `<img>`, framework `<Image>`, or `<video>` elements that do not meet an approved responsive pattern. The test will allow documented exceptions, such as machine-readable codes, only when they are bounded and shrink-safe.

The enforcement checks will cover, as applicable:

- a responsive frame or natural-size class;
- an explicit `cover`, `contain`, or natural behavior;
- a responsive `sizes` value for fill-mode framework images;
- bounded dimensions or aspect ratio for videos and posters; and
- no unbounded fixed width that can exceed a 320 px viewport.

## 6. Component migration strategy

The migration will be organized by media purpose rather than by route ownership.

1. **Foundation:** add the global safety baseline, shared frame contract, and policy test.
2. **High-visibility public media:** homepage hero, occasion carousel, product cards, shop results, product gallery, maker pages, header/footer, and 404.
3. **Customer media:** cart, wishlist, review attachments, recently viewed items, and account-facing previews.
4. **Seller and operational media:** upload previews, existing product media, seller profile media, rider/return evidence, and access-denied branding.
5. **Super Admin media:** hero manager previews, product lists, product review pages, and authorized private-media previews.

Each migration keeps the current content, destination, authorization, and interaction logic. The work must not create duplicate galleries, upload systems, or media routes.

## 7. Accessibility and interaction

- Existing meaningful alternative text remains meaningful and visible to assistive technology.
- Decorative media uses empty alternative text and remains excluded from the accessibility tree.
- Video descriptions, controls, muted/autoplay behavior, posters, reduced-motion behavior, and pause rules remain unchanged unless a rendering defect requires a narrowly scoped correction.
- Focus indicators and keyboard access remain reachable after media frames change size.
- Cropping must never remove text that was baked into essential instructional, evidence, document, QR, or logo media; those assets use `contain`.
- Captions and controls must reflow independently of the media and must not be baked into uploaded assets.

## 8. Performance and stability

- Framework image components receive accurate `sizes` values for their real grid or frame width.
- Above-the-fold priority loading remains limited to genuinely critical media.
- Offscreen images remain lazy loaded and videos retain conservative preload behavior.
- Frames reserve space before media loads to prevent layout shift.
- The implementation must not duplicate media downloads to support breakpoints.
- Media transformations remain in the existing upload pipeline or framework delivery path; the browser must not download a second decorative copy solely for responsive layout.

## 9. Testing design

### 9.1 Test-driven implementation

Each migration group begins with a failing regression or policy test, verifies the expected failure, applies the smallest correct change, and reruns the focused test before continuing.

Automated coverage includes:

- policy enforcement for new images and videos;
- approved `cover`, `contain`, and `natural` behaviors;
- responsive `sizes` on fill-mode framework images;
- future dynamic upload URLs using the same responsive frame as current records;
- image, video-poster, and active-video consistency in homepage and admin previews;
- product card, product gallery, cart, saved-product, review, seller, and admin examples;
- QR/logo/document exceptions remaining fully visible and shrink-safe;
- no change to authorization-aware media URLs or accessible text; and
- no regression to carousel, gallery, playback, upload-preview, or reduced-motion behavior.

### 9.2 Browser matrix

Representative local-staging routes will be checked at these viewport classes:

- 360 × 800 phone;
- 390 × 844 phone;
- 768 × 1024 tablet;
- 1024 × 768 compact desktop;
- 1440 × 900 desktop; and
- 1920 × 1080 wide desktop.

The QA route set includes the homepage with every hero-media type, shop results, a product detail with images and video, cart, wishlist or review media, seller product editing, Super Admin homepage preview, Super Admin product media, and the custom 404 page. Authenticated routes use only isolated local-staging identities and records.

For every checked state, verify:

- no page-level horizontal overflow;
- no clipped essential content;
- stable layout before and after media load;
- correct crop or containment mode;
- reachable controls and captions;
- no relevant console errors;
- no failed media requests; and
- no unexpected duplicate downloads.

### 9.3 Verification gates

Before completion, run and report:

- focused media-policy and component tests;
- the full npm test suite;
- TypeScript verification;
- lint;
- production build;
- desktop and mobile browser QA; and
- a visual mismatch ledger for the representative routes.

## 10. Acceptance criteria

The project is complete when:

1. every in-scope media render site uses an approved responsive mode;
2. current and future valid uploads render responsively through the same code path;
3. no representative route has page-level horizontal overflow from 320 px through wide desktop widths;
4. immersive imagery crops proportionally without distortion;
5. logos, QR codes, documents, evidence, and instructional media remain fully visible;
6. homepage image, video-poster, and video states share the same responsive geometry;
7. Super Admin previews accurately represent public crop and containment behavior;
8. accessibility and reduced-motion behavior remain intact;
9. the repository enforcement test prevents unapproved future media rendering patterns;
10. focused tests, full tests, TypeScript, lint, build, and browser QA pass; and
11. all work remains committed only to the existing staging branch until production deployment is separately authorized.

## 11. Non-goals and constraints

- No production deployment or production configuration change.
- No new paid image or video service.
- No replacement of object storage, upload authorization, or media routes.
- No fabricated catalogue assets or changes to existing catalogue records.
- No forced crop of identity, legal, document, evidence, QR, or instructional media.
- No arbitrary client-provided CSS, HTML, SVG, or executable media behavior.
- No blanket visual redesign of unrelated page content.

## 12. Known implementation considerations

- The repository includes both framework `<Image>` and authorization-aware raw `<img>` elements. Raw elements remain necessary for selected dynamic authenticated routes; they still must meet the same responsive contract.
- Hero videos require direct refs for playback coordination, so their implementation may use shared classes rather than a wrapper component.
- Existing fixed-size QR codes may retain their preferred 192 px size but must use `max-width: 100%` and an automatic height.
- Some private evidence files are downloads rather than inline previews. Only rendered previews require responsive frames; access-control behavior is unchanged.
- Production content, browser behavior, and data remain unverified and unapproved until a separately authorized production validation and deployment process occurs.
