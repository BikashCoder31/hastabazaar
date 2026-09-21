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
