# T31 C11/C12 account command recovery

Canonical checkout only; inspected memory fixtures, fake/captured media and no
provider, canonical database, deployment or Git mutation. Root owns Profile,
Address, Privacy consumers, customer intent, account sibling boundary and ledgers.
This slice owns the shared hook, ReviewForm, native outcome helper/GET and tests.

## Contracts and protections

`useAccountCommand({actorId,scopeKey,onRecorded,onDenied})` accepts an explicit
original action/source/request/endpoint/method/body. JSON and multipart bytes plus
the original content type remain in RAM for exact retry. Session storage receives
only a versioned actor/scope/action/source/request marker. Reload may only GET the
original native result. No new task/economic store, payload persistence or automatic
replacement attempt is introduced.

The hook supplies capture/current epoch guards, busy/blocked/denied states,
canRetry only for retained RAM, and a read-only saved-result check. Retired scope
responses cannot update new forms or invoke their callbacks. Confirmed callbacks
receive the captured original reference even after reload, so deleting address B
does not imply discarding an unrelated address A editor.

Definite first command 401/403 clears that known-prewrite attempt, hides private
controls and emits only an actor ID to sibling listeners. Retry denial after an
earlier uncertain response preserves the original reference; GET and sibling
denials likewise cannot prove the original action did not commit. Malformed/null
2xx is uncertain. Native success validates exact response shape; update-address
IDs must match the original target. Invalid references stay blocked with generic
Help guidance, not raw parse content or a fabricated missing/saved result.

Native GET `/api/account/command-outcomes` uses read-only existing-customer auth
and actor intent, never account provisioning. It returns only requestId and
recorded/unconfirmed. Native profile/address audit, original privacy request/audit
and review + exact original purchase/product references prove the original fact.
Current indexed identity/byte-exact status/auth-subject/customer-role and receipt/
source facts finish in one SELECT. Deleted-address receipt recovery remains valid;
an unknown address/review request must still have its owned current source.

ReviewForm uses the actual shared hook and native multipart route, required actor
and original order-item/product key, explicit recovery controls and a generic
known-denial curtain without another actor's reference. Form semantics, optional
title/photos, photo sanitization, original verified-purchase eligibility and
moderation remain unchanged. Field-error focus waits until the disabled fieldset
has actually rendered enabled. A recovered receipt proves original submission,
never a fabricated current awaiting-moderation state.

## Evidence checkpoint

- Native outcome missing-capability RED preceded implementation.
- Genuine profile/address create/update/delete/form receipts, privacy and actual
  delivered-live-order review with real subsequent native rejection; foreign
  ownership and late auth-subject revocation: **4/4**.
- Actual API reproduced GET503 after a real profile commit; diagnosed incorrect
  Request.url method use, fixed property access. Actual GET proves intent denial,
  no-store, no provisioning/write, exact recorded/unconfirmed and revoked role:
  **1/1**.
- Combined current native outcome/API group: **5/5**, exit 0, 22.20s,
  `.test-artifacts/t31/account-outcomes-final-memory.tap`.
- Root captured meaningful mounted REDs for first403 orphan marker, malformed
  200/null confirmation, and old disabled-field focus. Scoped fixes landed; root
  owns final combined and address browser reruns/global typing.
- Actual ReviewForm + native Review/Form/Outcome routes browser **1/1**, exit 0,
  18.29s, `account-review-browser-current.tap`: genuine delivered original source,
  first old-A/current-B403 with no review/blob, private curtain, identical multipart
  bytes/boundary RAM retry, postcommit lost ACK -> reload GET only, exactly one
  sanitized in-memory R2 photo and native review, no private browser storage and
  390px layout. Screenshot inspected; browser fully closed.
- Separate actual native address-delete + disable-at-batch test reproduced a
  commit authority gap (`account-delete-disabled-red.tap`). Root owns the mutation
  correction; this agent edited tests only. Existing form-backed profile/address/
  privacy/review guards checked active status but not customer-role membership;
  delete had neither. No broader policy/source edits were made here.

The additional four form-backed current-customer-role-removal-at-batch cases also
reproduced actual native writes before root's fix. Root's shared pure customer
predicate/atomic guards then passed five race cases plus the affected legacy/current
native group **54/54**, exit 0, 35.39s (`account-authority-native-current.tap`).
Root's actual address browser passed 16.90s, preserving an unrelated unsaved editor;
combined account browser passed 11.24s with original reload GET.

Hook/Review/helper/API source frozen after these checks; global typing remains
root-owned. Retained gift-card work is a separate authorized slice.
