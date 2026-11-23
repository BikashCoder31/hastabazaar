# Schema upgrade fix

The delivery branch is `codex/schema-upgrade-fix`, based on GitHub `main` at `0fdc112b`. The staging rehearsal evidence was committed first as `9509ece7`. The staging-only backup from 23 November is the source for each disposable restore.

| Task | Owner | Status | Evidence |
| --- | --- | --- | --- |
| F1 · Order the profile-media indexes | Codex | Source and manifest verified | Create the replacement before dropping the old index. The focused regression failed before the change and passed after it. |
| F2 · Converge the retained schema | Codex | In progress | Calibrate against the restored and canonical metadata with both existing checks intact. |
| F3 · Repeat the local rehearsal | Codex | Pending | Restore a fresh copy, reconcile both phases, and test the candidate package. |
| F4 · Handover | Codex | Pending | Record checks, hashes and one-evening order. |

## For the owner

The core upgrade and app switch are planned for the same maintenance evening. The previous rehearsal showed that release `41031347464-1` fails its schema readiness check on the canonical upgraded reference. [Original rehearsal results](staging-security-board.md#disposable-rehearsal-results--23-november)

### Position 64

The original order dropped the only index supporting `seller_profile_media_seller_fk`. The replacement starts with `seller_id` and is now installed first. The final index definitions and existing rows stay the same. The source can be edited on this branch, but the already-published package is immutable. The schema and release manifest generators bind the new companion bytes and recalculated prefix hashes. CI must build and verify a new package from the new selected schema digest.
