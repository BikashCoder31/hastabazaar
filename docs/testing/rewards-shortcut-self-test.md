# Daily rewards navigation — local acceptance, 2026-09-29

Request: make daily rewards reachable without first opening the customer dashboard.

Implemented a storefront header gift shortcut (desktop label, compact mobile icon), a labeled mobile menu entry, and a server-verified availability dot. The existing rewards page remains the destination. Guests are sent through sign-in with the rewards return path. Successful verified claims notify the shortcut to clear/reload availability. Visible pages revalidate within 60 seconds or at an earlier campaign/day boundary. Hidden pages avoid polling. Failed/unauthorized/malformed responses and account changes clear availability.

Regression evidence: verified-claim notification test failed before implementation and passed afterward. A mounted shortcut test caught and fixed a native fetch receiver error. Header authentication's isolated component stub now includes the independently tested shortcut.

Validation: 12 shortcut/header tests and 5 targeted mounted loyalty tests passed; TypeScript, scoped lint and production build passed. Browser checks at 1440, 1280, 1024, 768, 390 and 320 px found no horizontal overflow. Mobile menu opened /account/rewards. The actual local campaign reported paused and showed no dot. Browser-only intercepted active/claimed fixtures verified the dot appearing and clearing, without changing campaign settings or balances. No browser runtime errors.

Independent specification and quality/security reviews: PASS. All original dirty-file hashes match except the two intentionally extended header files; their pre-existing contents are preserved. Only task additions are staged in those files. Evidence and baseline hashes are under C:/Users/abinash/Desktop/Hatskala/reward-shortcut-20260929.

Local scope only; no migrations, production operations, or financial history edits.