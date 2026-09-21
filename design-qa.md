# Homepage editorial redesign — visual QA

- Final result: passed
- Environment: disposable local staging at `http://localhost:3000`
- Desktop viewport: 1536 × 1024, device scale factor 1
- Mobile viewport: 390 × 844, device scale factor 1
- Production deployment: not performed

## Visual truth and evidence

- Approved homepage direction: `C:/Users/abinash/AppData/Local/Temp/codex-clipboard-df7b9c36-ceee-4561-9776-8b8c8227f092.png`
- Maker section supplied for replacement: `C:/Users/abinash/AppData/Local/Temp/codex-clipboard-ecf58517-ac09-4538-be8c-ee3e01ed4b23.png`
- Occasion section supplied for decoration: `C:/Users/abinash/AppData/Local/Temp/codex-clipboard-c9dfa658-77fe-4656-86d1-7be2564ab90a.png`
- Desktop homepage: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/homepage-desktop.png`
- Mobile homepage: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/homepage-mobile.png`
- Desktop maker section: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/maker-section-desktop.png`
- Mobile maker section: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/maker-section-mobile.png`
- Desktop occasion section: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/occasion-section-desktop.png`
- Mobile occasion section: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/occasion-section-mobile.png`
- Desktop footer: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/footer-desktop.png`
- Mobile footer: `C:/Users/abinash/.codex/visualizations/2026/09/19/01a0bb7a-c3df-79d3-8373-045723b7d932/hastabazaar-local-qa/editorial-final/footer-mobile.png`

## Fidelity review

1. Structure: the desktop hero keeps the requested two-column editorial composition, overlapping category rail, and visible customer actions. The maker story uses a matching image-and-copy split.
2. Typography: navy display serif, compact uppercase labels, red italic emphasis, and readable sans-serif body copy follow the supplied direction.
3. Colour: cream, deep navy, warm red, ochre, and restrained neutral borders remain consistent across the hero, categories, and maker story.
4. Imagery: bags were removed. The hero uses Nepali pottery, carving, textile, architecture, and mountain context. The maker story uses a face-free close crop of hands decorating pottery, avoiding false attribution to a fictional maker.
5. Responsive behaviour: the category row remains horizontally usable; the maker block stacks cleanly; both calls to action become full-width on mobile; no horizontal overflow was detected.
6. Footer: the new customer-facing footer uses a calm parchment-and-navy action band, branded information hierarchy, accessible logo-only official social links, grouped navigation, and a compact policy strip. Staff and local-testing entry points are absent.
7. Occasion discovery: the gifting section retains its live occasion links while adding a low-contrast Nepali textile background, clearer editorial hierarchy, icon medallions, restrained watermark icons, and a distinct all-gifts destination. Cards stack cleanly on mobile.

## Iteration history

- The initial hero was taller and the heading wrapped differently from the approved reference. Grid proportions, title sizing, and spacing were tightened.
- An empty local category rail made visual review impossible. Fictional preview categories were added only for local staging/development; production empty-state behaviour is unchanged.
- The old maker block used a low-resolution macramé shelf image. It was replaced with an editorial craft-process image and matching content hierarchy.
- The first generated maker image showed an identifiable fictional face. It was replaced with a face-free hands-and-process composition.
- The mobile maker kicker clipped at 390 px. Font size, tracking, decorative spacing, and the mobile ornament were adjusted.
- The original footer was dense and repeated legal navigation while exposing internal sign-in/testing links. It was reorganized around customer tasks, simplified policies, stronger brand presentation, and public links only.
- The first action band used a saturated red field that competed with the rest of the page. It was softened to a warm parchment/sand gradient with navy copy and controls.
- Text labels for social networks were replaced with recognizable SVG brand marks while retaining accessible names and hover titles.
- The original gifting cards read as large empty colour blocks. They now use functional icon hierarchy, subtle card watermarks, supporting labels, contained arrow actions, and an asset-backed Nepali textile motif without introducing fictional makers or products.

## Verification

- `node scripts/verify-homepage-editorial.mjs <output-directory>` passed on desktop and mobile.
- Console errors: 0.
- Failed HTTP responses: 0.
- Horizontal overflow: none at either viewport.
- Old macramé maker asset references: 0.
- Occasion cards rendered: 2 in the current local fixture at both viewports.
- Internal footer entry points: 0.
- Remaining P0, P1, or P2 visual issues: none found.

---

# Homepage Hero Carousel Design QA

## Comparison target

- Source visual truth:
  - `C:\Users\abinash\AppData\Local\Temp\codex-clipboard-4b670045-7fd0-453e-9ddb-e769426ed16d.png` (1044 × 1060 px): reported banding and unreadable caption state.
  - `C:\Users\abinash\AppData\Local\Temp\codex-clipboard-44063d06-f0ad-4846-bc53-0fa6e77d9616.png` (1679 × 937 px): intended full-bleed image composition.
  - `C:\Users\abinash\AppData\Local\Temp\codex-clipboard-a77f38f3-2491-475c-8242-c9281b943277.png` (360 × 157 px): existing control arrangement to simplify from numbers to dots.
- Rendered implementation: `.staging/artifacts/homepage-hero-carousel/homepage-carousel-desktop-slide-1.png` (1536 × 785 px).
- Combined evidence: `.staging/artifacts/homepage-hero-carousel/design-qa-comparison.png` (1800 × 1320 px).
- Browser viewport: 1536 × 960 CSS px at device scale factor 1.
- Compared state: homepage, slide 1 selected, carousel at the top of the category overlap.
- Normalization: references were proportionally reduced without cropping and placed with the 1536 px implementation capture on one comparison board. The references describe three complementary requirements rather than one pixel-identical full-page mock.

## Full-view comparison

- The implementation removes the top and bottom media bands and fills the complete 36rem desktop hero track.
- The image remains sharp and uses an intentional muted navy treatment to satisfy the requested lower brightness.
- The slide caption is positioned in the quiet upper mountain/sky region with a translucent warm panel, dark type, and adequate contrast.
- Previous, next, dot selection, and pause controls form one compact muted group aligned above the category overlap.
- The established two-column hero, typography hierarchy, calls to action, category overlap, and brand palette remain intact.

## Focused-region comparison

- Media: the full-bleed treatment is visibly continuous from top to bottom. `object-cover` introduces an expected horizontal crop at the 52% desktop media track; the mountain and primary craft subjects remain visible.
- Caption: unlike the reported dark/red text over detailed objects, the new caption has a stable readable surface near the mountain and works across all three current photographs.
- Controls: visible numeric labels are removed. The three selection controls render as dots while retaining descriptive accessible labels and current-slide state.
- Mobile: the image follows the text stack at an 8:5 ratio, retains full coverage, and the controls do not create horizontal overflow.

## Findings

- No actionable P0, P1, or P2 differences remain.
- P3 intentional deviation: the caption uses a soft translucent card instead of unsupported free-floating handwritten text. This improves readability across administrator-selected media and can be revisited as optional polish.

## Required fidelity surfaces

- Fonts and typography: existing Hastabazaar heading and body typography is preserved; caption weight, line height, and wrapping remain readable.
- Spacing and layout rhythm: the 48/52 desktop grid, 36rem hero height, category overlap, CTA spacing, and responsive stack remain stable.
- Colors and visual tokens: muted warm cream, navy, and restrained red remain consistent; image brightness and saturation are deliberately reduced.
- Image quality and asset fidelity: existing WebP assets are reused at native quality with no placeholders, decorative substitutes, or duplicate image systems.
- Copy and content: all administrator-managed slide text, actions, alternative text, and caption content are preserved.

## Comparison history

1. Earlier evidence showed blurred letterbox bands, a caption over busy right-side objects, and numbered selectors.
2. Fixes applied: full-bleed media, calmer image treatment, upper-image caption placement, and dot navigation.
3. Post-fix evidence: the combined board and desktop slide captures show all four requested corrections; desktop/mobile browser checks report no console errors or horizontal overflow.

## Implementation checklist

- [x] Remove blurred media backdrop and letterbox bands.
- [x] Use full-bleed image, poster, and video presentation.
- [x] Reduce image brightness and saturation.
- [x] Move captions to a readable quiet image region.
- [x] Replace visible numbers with accessible dots.
- [x] Preserve arrows, pause, keyboard behavior, autoplay, and Super Admin slide content.
- [x] Verify desktop, mobile, all three slides, console health, and overflow.

final result: passed

---

# Hastabazaar v1.2.1 homepage follow-up — design QA

## Evidence and comparison target

- Existing supplied hero references remain the visual truth for full-bleed photography, quiet caption placement, and calmer controls.
- Existing supplied occasion reference: `C:/Users/abinash/AppData/Local/Temp/codex-clipboard-c9dfa658-77fe-4656-86d1-7be2564ab90a.png`.
- Current desktop hero slides: `.staging/artifacts/homepage-hero-carousel/homepage-carousel-desktop-slide-1.png` through `-3.png`.
- Current mobile hero slides: `.staging/artifacts/homepage-hero-carousel/homepage-carousel-mobile-slide-1.png` through `-3.png`.
- Current occasion slides: `.staging/artifacts/homepage-hero-carousel/homepage-occasion-{desktop,mobile}-slide-{1,2}.png`.
- Super Admin actual-layout preview: `.staging/artifacts/homepage-hero-carousel/homepage-occasion-admin-mobile-preview.png`.
- Machine-readable run: `.staging/artifacts/homepage-hero-carousel/homepage-carousel-results.json`.

## Review

1. Hero captions now use a 20% warm tint, restrained blur, navy italic text, a light text shadow, and a subtle edge. The Nepal photograph remains plainly visible through the caption on slide 1, including the mountain/sky region. The single caption element remains outside the image/video media branches, so images, video posters, and video playback share one treatment.
2. The supplied occasion reference's navy field, left editorial copy, paired action cards, warm highlight, and restrained controls remain intact. Slide 1 preserves the current content; slide 2 uses the same structure and visual hierarchy rather than introducing a second design system.
3. Desktop cards stay side by side and both slide layouts hold the same section height. Mobile stacks copy and cards in one column with reachable controls and no horizontal overflow.
4. All three hero slides and both occasion slides were inspected at 1536 × 960 and 390 × 844. Browser assertions found zero console errors, failed responses, overflow, or carousel-induced layout shift.
5. The Super Admin preview renders the real customer component. A fictional private draft changed the preview without code editing or redeployment while the effective customer page stayed unchanged.

## Known limitations

- The initial published hero fixture contains images only. Image, video-poster, and video caption consistency is structurally shared and covered by regression tests, while an actual disposable video playback fixture remains a documented manual self-test.
- Production rendering, data, configuration, migration state, storage, and publication remain unverified and unapproved. No production resource was accessed.

Final result: passed in disposable local staging.
