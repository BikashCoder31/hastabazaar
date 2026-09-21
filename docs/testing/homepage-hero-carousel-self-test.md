# Homepage hero carousel self-test

Version: v1.2.1 staging-only

Environment: disposable local staging
Production status: not approved and not tested by this package

## Safe local start

Use the isolated `codex/hastabazaar-v1-2-1-staging` worktree. Do not provide remote database, R2, SMTP, payment, or production credentials.

1. Set `HASTABAZAAR_RUNTIME_ENV=local_staging`, `APP_ORIGIN=http://localhost:3000`, `HASTABAZAAR_MAIL_MODE=capture`, `HASTABAZAAR_PAYMENT_MODE=simulated`, `HASTABAZAAR_RECIPIENT_DOMAIN=local.hastabazaar.test`, and `HASTABAZAAR_STAGING_ROOT=.staging` in the local shell.
2. Run `npm run dev` and wait for `http://localhost:3000/health/live`.
3. Run `npm run staging:seed`. The guard must report `Local D1 schema` and fictional `@local.hastabazaar.test` accounts. If hero images are blank, do not bypass the media route: rerun this guarded seed so the additive media registry migration is present.
4. Open `http://localhost:3000/`. All data, mail capture, media, and state must stay under `.staging/`.
5. Use `/local-testing` to select the fictional Super Admin role. Never use a real password or customer record for this test.

## Customer checks

Run `node scripts/verify-homepage-carousel.mjs`. Expected: exit code 0, three decoded images at desktop and mobile widths, no failed local responses, no console errors, no horizontal overflow, working previous/next/dot/keyboard controls, automatic wrap, and pause on hover, focus, manual pause, hidden document, and reduced motion. Evidence is written only to ignored `.staging/artifacts/homepage-hero-carousel/`.

Manual confirmation:

- Slide 1 retains the approved Nepal craft image, copy, two actions, four trust principles, note, and category overlap.
- Slide 2 shows anonymous hands working on clay; it makes no claim that a depicted face is the real maker.
- Slide 3 shows a face-free gift still life.
- Resize to 390 px and 1536 px. Text, controls, image, category panel, and focus rings remain usable.
- Pause, reload, and use arrow keys. Automatic changes remain silent to assistive technology; manual changes announce the selected slide.

## Super Admin checks

Use the fictional Super Admin at `/admin/homepage`. For each mutation, use a specific test-only reason and confirm the version history changes rather than rewriting an older row.

1. Edit slide 1 text and select another staged image. Save and publish; reload the customer homepage and confirm it changes without a code edit or redeploy.
2. Move slide 1 down, publish, and confirm the numbered order changes. Restore the original order afterward through a new version.
3. Add a complete fourth slide, preview desktop/mobile, schedule it a few minutes ahead, and confirm it is absent before and present after its effective time.
4. Disable slides until only two remain. Publishing must be rejected while the draft remains saveable.
5. Upload a valid JPG/PNG/WebP and confirm it is normalized. Try a renamed non-image, oversized image, malformed MP4, MP4 over 15 seconds, video without poster, and mismatched image/video fields; each must be rejected without becoming public.
6. Create a short, silent, fictional MP4 slide with a poster. Publish in disposable staging, confirm playback advances once at video end or by 15 seconds, then move away and confirm it pauses and resets. Restore the three-image version when finished. This is the only initial browser check that requires adding a test fixture; the automated upload/container tests run without it.
7. Use fictional Admin/customer accounts. Neither may open draft previews, upload/archive hero media, or publish settings.
8. Restore a prior published version. The system must create a later version; the restored source and earlier history remain unchanged.
9. Confirm media referenced by any retained version cannot be archived. Unreferenced media may be archived but not hard-deleted.
10. In disposable test data only, corrupt the effective hero value or leave fewer than three enabled slides. The current original slide must render as recovery content, the customer page must not crash, and no draft media may become public.

## Automated commands and latest results

Run from the isolated worktree:

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
node scripts/verify-homepage-carousel.mjs
```

Record the date, exit status, test count, build result, evidence directory, and any skipped check here after each milestone verification. Code inspection is not browser evidence.

Latest focused browser run — 21 September 2026:

- `node scripts/verify-homepage-carousel.mjs`: **Pass**.
- Three initial slides and all three 1800×1125 WebP images decoded at 1536×960 and 390×844.
- Previous, next, numbered selection, keyboard selection, automatic wrap, hover pause, focus pause, manual pause, hidden-document pause, and reduced-motion pause passed.
- No horizontal overflow, failed local responses, or browser console errors were observed.
- Evidence: `.staging/artifacts/homepage-hero-carousel/` (ignored, disposable local output).
- Video end/reset browser fixture: **Not Verified** for the reason below; automated MP4 validation and carousel-state tests remain required and passing.

Current browser limitation: the initial published fixture contains images only. The component, upload validation, publication preflight, and automated tests cover MP4 behavior, but the end-of-video browser scenario must be marked **Not Verified** until step 6 above is performed with a disposable short MP4.

## Safe reset

Only after verifying the current path is this worktree’s `.staging` directory, run the existing guarded reset command with its required confirmation argument. It must never accept a production binding or a path outside `.staging`. Re-run the seed afterward.

## Production gates

This package does not verify or authorize the deployed release, live schema, production D1/MariaDB choice, R2/storage capacity, backup/rollback, scheduler, SMTP, live issuer/company details, reviewed agreements, tax treatment, or public-content approval. Production migration and publication require separate approval.
