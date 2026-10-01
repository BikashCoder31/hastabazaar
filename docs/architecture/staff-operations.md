# Staff access and seller review

## Authentication and authorization

The internal `/admin` workspace uses Hastabazaar's email-and-password account system. Approved sellers use the same protected identity and role boundary.

A successful sign-in supplies identity, not authority. Every protected page, API mutation, and private document response performs a server-side D1 role lookup. Access is granted only when the signed-in email has an active Admin or Super Admin role, or a live invitation that is atomically accepted at first sign-in.

- Admin: seller/product review, catalogue, orders, support, standard refunds, payout preparation, and audit viewing.
- Super Admin: all Admin permissions plus staff invitations and major policy/credential controls.
- A staff member cannot review their own seller application.
- Only Super Admin can create or revoke staff invitations.
- UI visibility is never treated as an authorization boundary.

The refreshed [Admin workspace](admin-workspace.md) separates routine queues
from independent approvals and groups the available destinations by role.
Governance data is filtered on the server: ordinary Admins do not receive the
Super Admin-only user, incident, or backup datasets.

## Seller review workflow

The initial workflow is deliberately sequential:

1. `submitted` → `under_review`
2. `under_review` → `needs_changes`, `approved`, or `rejected`
3. Approval verifies pending documents and adds the `seller` role.

Decision notes are required for change, approval, and rejection actions. Every state change creates both a moderation event and an append-only audit record with the actor, previous state, next state, reason, request identifier, and timestamp.

Private evidence is streamed from R2 only after the same server-side staff check. R2 keys are never shown in the browser, and responses use `no-store`, `nosniff`, a restrictive content security policy, and safe filenames.

## Production bootstrap

Before the first production login:

1. Choose the company-controlled email that will own initial Super Admin access.
2. Copy `db/seeds/bootstrap-super-admin.example.sql` outside source control.
3. Replace `REPLACE_WITH_UUID` with a generated UUID and `REPLACE_WITH_COMPANY_EMAIL` with the normalized company email.
4. Apply the completed statement once to the production D1 database after migrations.
5. Sign in at `/admin` with the same email. The invitation is marked accepted and subsequent staff access can be managed from `/admin/team`.

The example file contains no live identity. Do not commit the completed production statement.

## Protected staging bootstrap

For a private review deployment, Sites runtime variables may temporarily define
`HASTABAZAAR_STAGING_SUPER_ADMIN_EMAIL` and `HASTABAZAAR_STAGING_ADMIN_EMAIL`.
Only the exact configured Super Admin email can initiate the bootstrap. On its
first `/admin` sign-in, the application creates audited, seven-day invitations
for both distinct addresses. The Admin cannot bootstrap itself, and the path
becomes inert as soon as an active Super Admin exists. Store the addresses only
as protected runtime values and remove them after both invitations are accepted.
