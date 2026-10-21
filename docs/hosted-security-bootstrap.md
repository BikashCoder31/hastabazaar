# Restricted first enrollment on hosted staging

This is a one-time owner-operated bootstrap procedure for an approved fresh hosted staging installation. It is not a deployment-gateway mode and is not authorized for the retained local checkout. Normal releases continue to require `/health` to return HTTP 200 with `marketplaceReady: true` and the exact release identity. Pending security setup must continue to return not-ready; do not increase the gateway timeout to accommodate enrollment, change its acceptance predicate, or add an environment bypass.

The staging gateway is intentionally unsuitable for first enrollment: it switches a release, waits briefly for full readiness, and rolls back on failure. Prepare and enroll the first verified candidate privately through the hosting owner's maintenance access **before** submitting it to the normal gateway. Do not start a gateway deployment during this procedure.

## 1. Review the destination and close access

Record the intended candidate artifact digest and release ID, the existing application target (if any), the exact staging database and media locations, the external security-policy directory, and the host owner performing the operation. Use the same HTTPS staging origin for bootstrap and later acceptance; the policy binds its origin. Existing installations or recovered databases require a reviewed recovery operation, never fresh provisioning.

Stop the staging Passenger application in the owner's hosting panel. Disable any automated staging deploy job for the maintenance interval. Leave production untouched. The restricted deployment SSH identity does not gain provisioning or bootstrap privileges; use the hosting owner's separately authorized maintenance access.

At the hosting web-server layer, retain staging HTTP Basic authentication and restrict access to the approved operator/staff IP addresses (or an equivalent private access gateway). Apply protection to **all** staging paths, including assets, APIs, auth callbacks, `/health`, and `/health/live`. Verify through a separate unauthenticated browser/request that the staging origin returns 401/403 and cannot reach application HTML. Verify a request from outside the allowed network is denied even with credentials. Do not proceed based only on a configured checkbox or on `noindex`; search headers are not access control. Keep the restrictions in place throughout enrollment and final staging acceptance.

If those hosting controls cannot be established and checked, stop. Do not expose the pending installation on a public route.

## 2. Install the reviewed candidate privately

Through owner maintenance access, place the exact reviewed release artifact in its staging release directory. Validate its archive digest, inventory, release manifest and all file hashes using the same `extractStagingArchive`/`verifyRelease` checks used by the delivery gateway. Do not extract an unreviewed archive over an existing release. Record the verification result without credentials.

With workers still stopped, point only the staging application's `current` link at that verified candidate and configure the normal staging `app.cjs` startup. This manual initial placement is an explicit maintenance action, **not release acceptance**. Do not invoke the gateway's switch/rollback transaction for this step. Keep any previous target recorded for rollback, and retain independent policy/key/data state outside both targets.

Use the reviewed staging runtime configuration and Node version. Confirm the database schema and the existing intended staff accounts through the normal preflight; this procedure never seeds accounts, migrates a database, restores data or resets passwords. Provision mail only to the approved staging QA recipients if first-password mailbox verification is required. Ensure the application and the CLI run as the same service account with the same private runtime bindings. Do not echo the environment or place secrets in command arguments.

## 3. Provision pending policy and enroll

For a fresh database with no private security records and a new external policy directory, run from the verified release directory:

```
node hosted-security.mjs --provision-new-host
node hosted-security.mjs --check-readiness
```

The second command should report pending setup, `ready: false`, and exit 2. This is the expected bootstrap state. Missing/corrupt configuration or existing private records are stop conditions, not a reason to create a replacement key or delete a policy directory. For a restored installation use the separately reviewed `--recover-existing-host` procedure instead; it must not recreate pending state.

Start only the staging Passenger application under the already-verified access restrictions. Confirm `/health/live` succeeds while `/health` remains HTTP 503/not-ready. Readiness does not globally block the existing sign-in and security-setup routes. Authenticate each existing active Admin and Super Admin using their own first factor, visit `/account/security`, complete authenticator confirmation, and acknowledge that recovery codes were saved privately. A new password, when needed, uses the existing mailbox verification ceremony. Never enroll one shared factor for multiple people or put recovery codes into the maintenance record.

After each enrollment, `node hosted-security.mjs --check-readiness` can be run again. Pending or unregistered active staff keeps exit 2 and blocks final acceptance. Resolve the actual staff inventory through the authorized staff-management process; do not remove roles merely to make a check green.

## 4. Restart and enter normal release acceptance

Once every required account is enrolled, restart staging using the hosting controls. Re-run the CLI check: require exit 0, initialized phase, `ready: true`, no reason codes and zero pending accounts. Confirm `/health` returns HTTP 200, `marketplaceReady: true`, and the exact reviewed release ID. Verify a fresh privileged sign-in requires the enrolled authenticator or an unused recovery code. Record only aggregate counts, release identity, check results, and timestamps. Recheck that unauthenticated/outside-network access remains denied.

Now submit the same verified candidate through the ordinary staging delivery gateway. It must pass its unchanged full-readiness and exact-release checks. Complete the protected staging smoke journey separately, using the enrolled staff accounts. Restore the scheduled staging delivery process only after successful acceptance. Keep staging's normal access restrictions; releasing public production traffic requires its separate approved deployment decision.

If any step fails, keep traffic restricted and stop the staging application if necessary. Do not reset the policy, key, manifest or account state. A failed final gateway run follows its existing application rollback; external initialized state must survive it. If the previous application cannot use that initialized state, leave staging stopped for reviewed recovery instead of downgrading protection.

## Verification scope

The isolated bootstrap regression exercises real hosted policy provisioning and real security routes against an in-memory authentication database. It verifies pending readiness, enrollment, restarted initialization, and final enrollment readiness. It cannot certify a remote host's web-server access rules, staff identities, mailbox delivery, Passenger setup, or artifact placement; the operator checks above are required before use. No remote bootstrap or retained-data operation was performed while adding this procedure.
