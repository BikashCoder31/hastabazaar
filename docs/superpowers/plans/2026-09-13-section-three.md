# Section 3 implementation plan — 13 September 2026

User approved customer journey, mobile accessibility and discovery. Local work only; preserve existing changes and historical data. No schema migration, deployment or external messages planned.

1. Record baseline using the existing isolated MariaDB/standalone harness and synthetic accounts, with screenshots at 320/390/1440 px. Measure browser lab LCP/CLS/interaction latency/payloads; these are not field Core Web Vitals.
2. Reproduce address defects (ward zero, arbitrary district, province mismatch). Normalize new input only, keep manual addressing and current tariffs, add focused regression tests. Add clear error recovery and accessible district choices.
3. Implement explicit public sitemap/robots/canonical/product structured metadata using current purchase-publication eligibility and approved reviews. Keep private pages noindex, avoid caching authenticated HTML.
4. Fix observed mobile/keyboard and performance problems. Retest guest and signed-in checkout, map denial, address recovery, public discovery and protected order journeys. Run existing tests, TypeScript, lint and isolated Babal build.
5. Save local evidence/report and cumulative candidate with deployment-only acceptance deferred. No automated courier or cash wallet features.

## Completion record

All five steps are implemented. Evidence, known deployment gates and the cumulative candidate are recorded in `docs/architecture/section-three-customer-journey-2026-09-13.md`. The final browser suite includes regressions for the guest receipt-cookie route and settled skip-link scrolling.
