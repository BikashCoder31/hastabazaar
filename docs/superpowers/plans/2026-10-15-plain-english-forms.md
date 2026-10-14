# Plain English forms implementation plan

**Goal:** Make the existing form catalog easier to manage and all registered forms easier to understand in simple English.

**Approved brief:** The user approved the recommendations in chat and requested implementation in simple English only. Continue in this session.

**Architecture:** Extend the existing catalog, versioned configuration, and shared form renderer. Keep field keys, business checks, permissions, submitted values, and historical answer snapshots intact. Provide shared task descriptions and field guidance without replacing deliberate published wording.

## Tasks

- [x] Add task names, descriptions, preparation guidance and readable built-in field wording for registered forms.
- [x] Add catalog search, category/audience/status filters, attention counts, plain publishing state, preview/edit/history links, and an empty state. Test filtering and stale draft handling.
- [x] Improve the editor: explain the publishing workflow, distinguish built-in questions from automatic data, seed helpful wording, summarize pending changes, and improve illustrative previews.
- [x] Improve live forms: visible guidance, simpler labels, optional cues, persistent examples and upload guidance. Preserve existing submission, field errors, and retry behavior.
- [x] Verify focused and full test suites, type checking, lint, and browser interactions at desktop and mobile widths. Record failures and deployment limits.

## Review focus

- A historical draft below the latest publication must not count as unpublished changes.
- Catalog filters combine and search the purpose as well as the title.
- Published custom wording and historical answer labels must remain intact.
- Multiple forms and previews must have unique label/control IDs.
- Optional fields must not gain required validation, and protected automatic values must not be presented as questions to fill in.

## Decisions

Use the existing draft/preview/publish/history controls. Do not add a parallel publishing subsystem. Do not store application documents or personal answers in browser storage; resume functionality requires a dedicated authenticated draft flow and is beyond wording/catalog changes. Existing product drafts continue to provide save-and-return support.

## Verification record

- Task names and guidance cover all 98 registered forms, including 61 editable business forms. Guidance is rendered in 61 component/page files; small search and sign-out controls retain their existing layout.
- Final form regression run: 141 tests passed, zero failures, including every updated selector from the broader suite.
- After the final wording corrections: 48 application, catalog editor, plain-language, and change-summary tests passed. Type checking, lint, whitespace checks, and the Babal production build passed on the saved source.
- The earlier full project run completed: 2,507 passed, six failed and 15 skipped. All six failures used names or selectors changed by this work. Those tests were updated and passed in the 141-test form regression run. The full project suite was not repeated after those updates.
- Browser: actual local D1 draft save and publish; catalog search plus audience filter; empty-state reset; publication status and last editor; live seller application defaults, help, and conditional questions. Desktop 1536px and phone 390px; no horizontal overflow on catalog or seller application.
- Read-only review findings corrected: form-aware identifier classification, consistent preview/live legacy labels, category-specific naming, and required-email feedback guidance.
- No new schema or live deployment. Local preview uses a fresh isolated database with fictional accounts.
