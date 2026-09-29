# Homepage craft details replacement — 2026-09-29

User request: keep the footer's “Crafted in Nepal. Connected to the world.” banner and replace the earlier maker section, whose shop/seller calls to action repeat it.

## Scope

Replace the earlier “Every craft begins with a pair of hands” promotion with “A closer look at handmade”: a short visual guide to materials, finishing, and small variations. Keep the existing workshop image, meaningful alt text, and `/\#makers` navigation destination. No repeated shop or seller button in this section. The footer, adjacent promise section, and other homepage flows remain unchanged.

The new layout uses scoped styles with separate image/text columns and a mobile stack. It avoids the inherited overlap visible in the user's screenshot. No backend, financial, or account behavior changes.

## Regression evidence

Two rendered regressions failed against the old section: the new guide was absent, and the distinct labelled region was absent. Footer/adjacent-section preservation passed before implementation.

The existing responsive-media test follows the extracted image into the new component, retaining cover and image-sizing checks. Prior unrelated hero assertions in that dirty test are preserved and excluded from this task's commit.

Browser QA uses the previously authorized local Playwright fallback; no Browser skill is available. Evidence is saved under `C:/Users/abinash/Desktop/Hatskala/homepage-craft-details-20260929/`.

## Final verification

- 9/9 focused tests passed; TypeScript, scoped lint, and diff checks passed.
- Independent specification and quality/accessibility reviews passed.
- Browser checked 1440, 1024, 768, 390 and 320px: image loaded, no image/heading overlap, no horizontal page overflow, no page errors. Section screenshots were visually inspected.
- Existing Our makers link reaches #makers. Footer heading and Share your craft link remain present; footer source hash is unchanged.
- All 37 unrelated dirty file hashes remain unchanged. The existing hero-test edits remain intact and unstaged.
