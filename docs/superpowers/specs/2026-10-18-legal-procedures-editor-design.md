# Local Legal procedures draft editor

The user approved updating the existing internal procedure locally, with correct shared company details, clearer sections, retained version history, and Super Admin editing. All content remains a review draft. No database migrations, deployment, changes to existing records or agreements, financial terms, or public policies are authorized.

## Design

Use the existing audit log as an append-only internal draft store, with a dedicated action/subject namespace. Each saved revision has a deterministic unique row ID, full content/company snapshot, SHA-256, previous snapshot, author, time and reason. An atomic conditional INSERT checks the expected current revision/hash and current active Super Admin identity. Unique IDs prevent competing saves from overwriting each other. Exact retries return their existing revision. Nothing updates or deletes old rows.

Retain the exact original internal-compliance JSON document as Draft 3.0 history. A new bundled Draft 3.1 uses company-details.ts for identity/PAN/address, keeps approval and effective date unset, separates fourteen stable sections, and retains substantive existing procedures as proposals. Owner names and unverified registration/contact facts are not invented. No commission percentage is introduced.

The Super Admin page offers Read draft, Edit draft, Preview and Version history. Only procedure section text is editable; shared company details and draft status are outside this editor. Plain text rendering keeps user content inert and preserves line breaks. Saves require a reason and never approve or publish. History is read-only and paginated. Errors retain unsaved edits; stale saves conflict instead of replacing another revision. Corrupt stored content fails closed.

Existing active Super Admin identity is queried directly without account bootstrap or invitation acceptance. API requests require current authorization, bounded JSON, strict known fields, and trusted origin. Save additionally requires an Origin header. No local/staging account records or permissions change.

## Verification

Write tests first using isolated in-memory SQLite fixtures. Cover authorization and revocation, origin/size/input checks, competing saves, retry binding, corruption, immutable history, and public/accepted snapshot preservation. Exercise mounted editor preview/save/failure/history with all network intercepted. Run related legal and agreement regressions, lint, typecheck, build and local preflight. Verify the page in normal Chrome using the existing local Super Admin. One real save of the user-approved refreshed draft is authorized; test mutations stay in isolated fixtures. Keep the correct local server running. Independent GPT-6.1 Sol xhigh reviewers inspect code and tests.

## Limits

This is document drafting, not legal approval, case management, or a launch-compliance certification. No approval/publish/restore/delete actions exist. Native MariaDB behavior is not certified by local SQLite verification. Full-suite execution is subject to test safety and the developer's requirement for checks appropriate to the change. The existing outer admin layout retains its ordinary hosted-session maintenance/bootstrap behavior; this change does not alter global authentication. The new legal API/leaf authorization is read-only, and the actual local browser uses the existing local test identity, which does not trigger hosted-session maintenance. Local before/after fingerprints, rather than an unverified hosted-page claim, establish record preservation for this task.
