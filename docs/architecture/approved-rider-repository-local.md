# Approved rider repository verification

13 September 2026. This report covers repository and synthetic verification support; root owns the rider UI/API/media and parcel integration.

Reproduced and fixed: optional prepaid OTP incorrectly gated failure reports; acceptance helper allowed nonstaff callers; stale assignment was only read before commit. OTP is now required only for delivered reports when the configured prepaid policy applies. COD never requires OTP. Staff acceptance binds the exact incremented parcel version, operation request, current approved rider, active parent order, dispatched source, and current staff authority inside the caller transaction. Reports and OTP never themselves deliver a parcel or post cash.

Failure acceptance creates an open exception follow-up assigned to the confirming operations staff, or appends source-linked history to the existing open same-kind work. It uses the existing exception queue and assignment notifications, without a second ledger. Proof rejection remains a rejected report requiring resubmission. Record acceptance, follow-up, audit and queued notifications commit together with the authorized parcel transition.

Optional code issuance checks authenticated active customer ownership or the exact non-null stored receipt-token hash. Null identity alone grants nothing. Only eligible prepaid assigned dispatched jobs on active orders receive a code; the policy starts off. The plaintext is returned only to that authorized web caller. Salted code hashes, 10-minute expiry, five verification attempts, assignment/rider binding, replay rejection, and active-order/approval checks protect verification. No email or SMS sender is invoked. Code verification does not replace proof or staff confirmation.

Staff notification candidates are resolved with effective permissions and insert conditions retain exact role/profile snapshots. Revocation before insert suppresses those recipients. Source locks serialize rider application, review, policy and report-rejection decisions. Policy updates save immutable version snapshots in the same transaction; both dialects protect report primary identity, original evidence and terminal acceptance/rejection review metadata.

Files: lib/riders/repository.ts, both 0038 rider migrations, generated release manifest, tests/rider-repository.test.ts, scripts/verify-rider-repository-native.ts, and two adjusted tests in returns-complaints.test.ts (historical approved rider location, approved parcel proof/staff confirmation). No partial-cancellation changes.

Verification: nine focused repository tests passed; both meaningful legacy integration fixture updates passed; final native run passed seven groups including cancelled-parent and terminal identity assertions and is recorded in outputs/approved-four-2026-09-13T05-17-00-125Z/rider-repository-native.json. Only fresh synthetic MariaDB databases and queued notifications were used. Root performs cumulative UI/browser/build verification separately.

Final touched lint and TypeScript checks passed. The native cancellation negative test restores only its own synthetic fixture after testing the real cancellation-propagation triggers. No existing business records were touched.

## Final integrated acceptance update

Combined rider browser and optional prepaid code browser acceptance passed, including staff confirmation and suspension. Evidence rider-browser/integration.json and rider-otp-browser/integration.json. No real messages or deployment. See approved-four-local-2026-09-13.md for final-source boundaries.
