# Unilateral Super Admin Approval Design

**Date:** 2026-09-21  
**Branch:** `codex/hastabazaar-v1-2-1-staging`  
**Status:** Approved for staging implementation

## Objective

Allow Hastabazaar to operate safely with one active Super Admin. An authenticated, active Super Admin with the required server-side permission may complete both the preparation/submission step and the later approval or rejection step without a second Super Admin account.

The system must continue to support creating additional Super Admin accounts, but the presence or absence of another Super Admin must not change approval authority.

## Approval model

- Preserve the existing staged state machines. Creating, preparing, or submitting a decision does not silently approve it.
- Permit the same authorized Super Admin to perform the later approve or reject action.
- Continue to require the correct Super Admin permission on every mutating server route and repository operation.
- Preserve reasons, previews, effective dates, notice periods, scheduling, idempotency, optimistic concurrency checks, immutable versions, and audit events.
- Record the actor independently for each workflow step. `prepared_by`, `submitted_by`, or equivalent may equal `approved_by` or `decided_by` after this change.
- Do not grant ordinary Admins, sellers, riders, customers, or unauthenticated users any additional authority.

## Workflows in scope

Remove the second-Super-Admin identity requirement from existing Super Admin-controlled decisions, including:

- controlled Business Settings publication and rejection;
- independent-seller and managed-program payouts;
- high-value refund approval;
- promotion approval;
- staff-permission request decisions;
- managed fixed-supply decisions and simulated supplier-payment approval; and
- any equivalent current server-side guard whose only purpose is to require a different Super Admin identity.

## Boundaries retained

This change does not remove role, ownership, or evidence boundaries that are not second-Super-Admin controls. In particular:

- a seller cannot approve their own seller application merely because they also hold another role;
- a rider cannot verify their own cash handover;
- self-deletion or removal of the acting user's critical access remains protected;
- validation, balance, status-transition, simulation-only, and production-payment restrictions remain unchanged; and
- this change does not activate real payment movement or authorize a production deployment.

## User interface

- Ordinary Admin users see `Super Admin approval required` for controlled decisions they may prepare but cannot approve.
- Super Admin users do not see that warning.
- Super Admin action controls remain visible when they prepared or submitted the item themselves.
- Remove instructions that tell a Super Admin to find a different Super Admin.
- Keep the existing explicit approval/rejection controls and confirmation information.

## Data model and migration

Add versioned staging migrations that remove only database constraints requiring approval and preparation actors to differ. Preserve all columns, foreign keys, indexes, status constraints, existing rows, timestamps, and audit history. Update canonical SQLite/Drizzle and MariaDB deployment schemas consistently.

Historical records remain immutable. No existing actor attribution is rewritten.

## Verification

Use test-driven development. First demonstrate failing regression tests, then make the smallest implementation that passes. Tests must cover:

- the same active Super Admin successfully preparing/submitting and approving or rejecting each in-scope workflow;
- ordinary Admin and unauthorized-user denial;
- required permissions and server-side authorization remaining enforced;
- retained workflow validation, scheduling, reasons, audit history, and idempotency;
- Super Admin UI omitting the warning while Admin UI shows `Super Admin approval required`;
- creation and use of additional Super Admin accounts remaining supported;
- schema migrations accepting equal preparation and approval actors without rewriting history; and
- retained seller, rider, and self-access safety boundaries.

Run focused tests, the full npm test suite, TypeScript verification, lint, build, and local browser QA for both Admin and Super Admin views. Commit the implementation to the staging branch. Production deployment requires a separate explicit cutover confirmation.
