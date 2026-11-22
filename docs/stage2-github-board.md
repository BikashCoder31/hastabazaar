# Stage 2 GitHub

The candidate starts from `admin-redesign` at `f7110503`. The fetched `origin/main` and merge base are both `1addd7e9d60ace09e111d30ad5d4a8140998ecc6`. The source branch is 117 ahead and 0 behind, so the delivery branch started without a merge.

| Task | Owner | Status | Checks |
| --- | --- | --- | --- |
| G1 · Prepare the branch | Main | Done | Typecheck, lint, 100 focused tests, additional readiness and byte-lock checks, the nine migration pairs and the Linux package passed. The full suite recorded 5,855 passes, 38 skips and two early SQL byte-lock failures. Both failures passed after the line-ending fix. |
| G2 · Push and open the pull request | Main | In progress | Owner approved the first push. GitHub received `d0ceda5d`. The workflow changes passed 38 focused tests. |
| G3 · Hand over | Main | Pending | Record the pull request, run and each job result after CI. |

## For the owner

- First push approval covers `origin/main..redesign-release-20261122`, starting after `1addd7e9`. The delivery branch adds 119 commits and changes 3,476 files against the fetched base. It contains the 117 source commits, the reviewed SQL byte fix and this board.
- The pre-push scan covered the tip tree and incoming Git history. It found zero restricted file paths and zero matching credential patterns. The full suite finished before this approval checkpoint. The two pre-fix source-byte failures passed in the focused reruns, and the package rebuilt from the committed fix.

- Delivery uses the separate managed worktree. The release branch starts from the committed source. The uncommitted design-reference edits are still in the canonical checkout.
- Release prep R1 recorded all nine readiness corrections as present. The candidate includes that reconciliation and subsequent NCM release prep. The local focused checks exercised release inventory, security readiness, and the native result contract. The 33 historical SQL files in `f33c0495` retain their exact reviewed bytes in fresh Git checkouts. This preserves the locked build schema hash and changes only the line endings of those SQL files.
- The owner authorized restoring **Verify and Package** and staging deployment on a successful push to `main`. Pull requests run lint, typecheck, four test shards and the artifact/native gates. The separate Linux package and staging deployment jobs skip pull requests. Production promotion remains manual.
- After a future staging deployment, read the release ID and commit from the GitHub package summary. Open `https://staging.hastabazaar.com/health` with the approved staging Basic Auth account. Verify HTTP 200, `marketplaceReady: true` and a `release` value equal to the summary’s `hastabazaar-release-ci-<run_id>-<run_attempt>`.
- Linux x64 packaging passed on Node 22.23.2 for `f33c0495`. A fresh Git archive produced the exact locked schema SHA-256 `aa248443d0f54096a83a11c74c6b3cda66774431417cd64be9cd127af98a3493`. The extracted archive passed runtime and inventory checks. Its SHA-256 is `21a45b54b6144af4a2f30528d79f00f304808b92b79488e9cfe53036974ac2d0`.
- **Verify and Package** pulls the Linux x64 manifest `sha256:5ae7fc7b20f8e07c0ee169ff24617b39cb99b4bfc147555cea758baa69834d9e` from the reviewed MariaDB 10.11 index before both native gates. The selected-artifact gate receives the locally inspected image ID from that step. The deployment job uses the existing restricted staging gateway.
- The release manifest lists 0164–0172 as owner-applied pairs. The staging database remains at its current schema until you take a verified backup and apply the applicable MariaDB files by hand. The guarded pages stay hidden or use their existing fallback until the corresponding schema is present. [Release prep and apply commands](release-prep-board.md)
- NCM API starts in manual mode. Complete the protected setup, pickup mappings, webhook registration and scheduled check before enabling API booking. [NCM API setup](ncm-api-board.md)

### Staging email sender

Use the Messages M1 setup after the staging runtime and the exact email-job route have been reviewed. The secret belongs in the app environment and the protected staging `sender.env`, using `ORDER_EMAIL_JOB_SECRET=<SAME_STAGING_SECRET_AS_THE_APP>`. [Sender setup](babal-host-setup.md#schedule-the-email-sender)

```cron
* * * * * /usr/bin/env PATH=/usr/local/bin:/usr/bin:/bin /ABSOLUTE/PATH/TO/NODE --env-file=/home2/hastabaz/hastabazaar-email/staging/sender.env /home2/hastabaz/hastabazaar-email/staging/run-email-automation.mjs --config /home2/hastabaz/hastabazaar-email/staging/sender.json --execute >> /home2/hastabaz/hastabazaar-email/staging/sender.jsonl 2>&1
```
