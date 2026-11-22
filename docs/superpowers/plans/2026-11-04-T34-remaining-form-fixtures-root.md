# T34 remaining form fixture corrections — 4 November 2026

Three already-dirty test files were preserved byte for byte before this task. No production source changed. Owned artifacts: `.test-artifacts/t34/remaining-form-fixtures-root-20261104/`; exact before/after SHA256: `source-hashes.json`.

- Seller privacy export fixture omitted required audit columns. It now uses the exact audit table CREATE from migration 0000. Product ownership, submission/inventory export and foreign-owner exclusion assertions remain.
- Seller reply fixture wrongly treated an absent optional published form as an outage. An actual owned review now proves core-only save and exact replay produce one reply, one core-answer audit and zero published answer sets. A fresh database wrapper with a real configuration-read failure separately proves 503/config_unavailable and no additional reply; no cached verified form can mask that failure. Existing required-answer, stale-version, changed-body, foreign-review and wrong-owner checks remain.
- Email query publication fixture omitted the approved sent_record/captured/uncertain/intervention statuses. Added those values and their canonical labels. All ten query adapters still publish and resolve exact presentation, without writing answer sets. No mail was sent.

`focused.tap` retained the intermediate failures: 10/13 passed, with missing labels causing invalid form validation and an obsolete outage wording assertion. `final-focused.tap` passes 13/13, zero skipped, exit 0, 24.294 seconds, after those fixture corrections. Fixtures were inspected and use isolated in-memory SQLite; TEMP and TMP were pinned to the project `.test-artifacts/t34/tmp` directory.

Exact final command:

```powershell
node --import tsx --test --test-concurrency=1 --test-name-pattern='^(privacy export follows product seller profile ownership for submission and inventory snapshots|seller reply links context to one pending reply and cannot replay onto a foreign review|all registered query adapters publish and resolve nonempty typed presentation without recording answers)$' tests/form-catalog-seller-privacy.test.ts tests/form-catalog-seller-operations.test.ts tests/form-catalog-query-publication.test.ts
```

This is bounded fixture verification. No full-suite, native engine, browser, canonical startup, build or release acceptance is claimed. Canonical data and all deployment/live-effect holds remain intact.
