# Free Support Assistant Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add subscription-free website support with WhatsApp handoff and consistent company contact details.
**Architecture:** Shared public contacts and prepared support content, a client-only FAQ matcher and public-route support panel. No new dependencies or services.
**Tech Stack:** Existing React, TypeScript, CSS modules and node:test/Playwright.
**Spec:** docs/superpowers/specs/2026-10-28-free-support-assistant-design.md

## Global constraints
Canonical C:/Users/abinash/Desktop/HastaBazaar; local staging only; no database mutation, deployments or WhatsApp account changes. Preserve pre-existing edits.

## Tasks
- [x] Add contact constants, shared order-help topics and matching/handoff helpers; test English/Nepali input, unknown questions, ambiguity, encoding and private URL exclusion.
- [x] Implement the public support widget and update footer/contact/help/disclosure/company default contacts. Verify keyboard and mobile behavior with the existing Playwright installation.
- [x] Run targeted tests, typecheck, lint and local preview checks; inspect the final diff and resolve defects.

## Review focus
Private URL/query leakage, substring false matches, inaccurate policy promises, keyboard focus and mobile clipping, accidentally overwriting existing work.

## Execution record
Local preflight passed (89/89 forms, sign-in schema ready). Existing checkout is extensively modified; edits must be surgical. The user's instruction to proceed authorizes implementation of the discussed first version without another approval round.

Verification: 41 initial targeted tests passed, followed by 26 relevant tests after review fixes. Full TypeScript check and scoped lint passed. Independent review caught missing authentication/private-history route exclusions and focus loss on topic transitions; both were fixed and re-reviewed. Playwright with installed Chrome verified /help, /contact-us, /legal and /login, matching/fallback, seller/gift guides, WhatsApp destination, no question text transmission, and Escape/focus restoration at 1440x1000, 390x844, 320x568 and 740x360. Browser console had no errors; screenshots were inspected and saved outside the repository. Browser plugin was unavailable, so the existing Playwright installation was used.

The sandbox blocked localhost connections on the first launch. Approved elevated execution of the same npm run dev launcher succeeded, with all preflight guards intact. No schema/data recovery operations, paid services, WhatsApp messages, account changes or deployment were performed. Saved commercial contact snapshots were preserved; only the new-configuration default was filled. Assistant answers are prepared English guidance with selected English/Nepali/Romanized keyword matches, not generative AI or a full translation system. Live order/payout lookups and actual WhatsApp message sending were not tested or enabled.

## Follow-up: contact page and assistant refinement

User requested further improvement from the contact-page preview. Refined the contact page into responsive support options and a clearly titled message form; added order-tracking, help-guide and seller shortcuts. Kept the existing form submission behavior. Refined the assistant with compact icon tiles, one primary answer, optional related topics, and less repeated text. Added limited spelling aliases and specificity ranking so cancellation/refund/payout requests outrank generic order/seller words, and delivery fees do not suggest seller commission.

The new matching regression failed on cancellation before the fix; all six support tests now pass. Local preflight, full typecheck, scoped lint and browser interaction checks passed. Browser checks cover desktop, 390px/320px mobile and landscape layouts, contact shortcuts and number, fallback, gift follow-ups, topic-specific WhatsApp drafts, private question isolation, and keyboard focus. No browser console errors. Independent code review reported no important findings. Screenshots are saved outside the checkout. No deployment or WhatsApp account configuration was performed.

## Follow-up: smaller launcher and clearer panel

User supplied the large launcher screenshot and requested a smaller, more attractive control and better contents. Reduced the launcher to a 44px-high navy Help pill, with a 44px icon-only button on phones and explicit accessible names. Reduced the panel from 392×660 to 360×570 maximum, shortened topic labels, and presented order guidance as brief bullets with existing qualifications preserved. Answer views omit the audience selector to leave more reading space; All topics returns to that selector. Updated custom-order and seller copy, retaining WhatsApp handoff and the approved number.

Local preflight, six support tests, full typecheck and scoped lint passed. Updated browser checks passed at desktop, 390px/320px mobile and landscape sizes with no console errors, including navigation, accessible focus, gift paths, number and private-question isolation. Independent review found no important regressions. Final screenshots were inspected. Local only; no paid dependencies or external account changes.

## Follow-up: expanded customer and seller questions

Added 20 prepared topics (33 total), grounded in the existing public help/terms and account/seller pages. Customer additions cover ordering, delivery coverage/delays, address changes, receipts, sign-in, offers, wishlist, availability, reviews, privacy and product care. Seller additions cover verification documents, application status, listings, publication review, stock, fulfilment, case responses and shop/payout-detail changes. Payout guidance is now separate from listings. Grouped More shopping questions and More seller questions lists preserve the compact panel; typing remains available.

Eight tests cover existing and new intent matching, all 23 browseable question labels, destination-page existence, privacy and handoff behavior. Regression checks caught generic receipt, return and review wording crossing into the wrong workflows; corrected the keywords and verified the fixes. The browser check passed the expanded lists, keyboard expansion, selected customer/seller answers and 320px mobile access alongside the earlier interaction checks. Full typecheck, scoped lint and canonical read-only preflight passed. Screenshots inspected; browser console empty. No paid services, account-data lookup, deployment or WhatsApp account changes.

## Follow-up: consistent Hastabazaar brand spelling

Standardized current displayed brand copy to Hastabazaar across pages, metadata, account/seller/admin UI, emails, support, current policy documents and photo-watermark rendering. The registered legal name Hasta Bazaar Private Limited, canonical checkout path, technical identifiers and historical records retain their exact identities. Archived all ten previous current policy bodies before editing and refreshed normalized current checksums. Watermark renderer v2 includes lowercase b and invalidates the earlier derivative cache.

Review identified that whole-document fingerprints could invalidate accepted maker agreements or pending registered-route transitions after a spelling-only edit. Added exact prior-brand compatibility while retaining every commercial field/version check and original accepted document/context; fresh registered acceptance remains strict. No production or staging business records were edited. Regression tests cover both maker agreement versions, transition approval/application, and rejection of changed rates, PAN, obligations and setting IDs. Validation passed 48 branding/content/email/watermark/support tests, seven native maker tests and 15 commercial/transition tests. Browser checks passed on 16 public pages and metadata, WhatsApp draft and mobile sizing, with no page errors. The guarded preview was restarted after the large hot reload stalled.
