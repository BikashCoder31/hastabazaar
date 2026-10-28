# Local guarded brace parser

This private package replaces every installed `braces` consumer through the root npm override. It is a reviewed local derivative, **not an official patched release of braces**.

## Source and license

- Base: `@dieub/braces-depth-guard@3.0.3-pn.3`, commit `305a2e4bfe324bb53c336c1b03387ee1251c926f`.
- Original parser: `braces@3.0.3` by Jon Schlinkert and contributors.
- Exact archive integrity and source references are recorded in package.json. Original MIT notices are retained in LICENSE, and the fork's README is retained as UPSTREAM-README.md.
- No install scripts, downloads or build steps are required by this package.

## Security changes

The base fork limits combined braces/parentheses to 100 nested levels and input to 10,000 characters. The same depth ceiling applies to compile, stringify and expand AST entry points. Caller options can lower the ceiling, but Infinity, NaN or oversized values cannot raise it. Quotes and escapes retain their normal meaning.

Local additions bound expansion's acyclic parent chains to the same depth ceiling (alongside its cycle check) and bound AST visits to 20,000 nodes, including leaf nodes. This ceiling accommodates parsed inputs up to the hard character limit. Normal numeric ranges, alternatives and matching behavior remain unchanged.

These guards address GHSA-vfj7-8cjw-p6xm's recursive stack-exhaustion issue. Existing numeric-range limits remain in force. This is **not a general sandbox for arbitrary untrusted glob expansion**; Cartesian expansion cardinality is unchanged. Do not expose arbitrary globs as an application feature without a separate resource-budget design.

## Verification and maintenance

Run `node --import tsx --test tests/braces-security.test.ts`, then the normal build and security tests. Tests cover every public string entry, direct ASTs, cycles, long parent chains, width, option bypasses, normal matching and transitive resolution.

Keep this source and its provenance in source packages used to install dependencies. Inspect the lockfile to confirm every `braces` reference resolves here. npm audit may not associate advisories for the original package with this private name: a clean audit alone does not prove the patch is safe. Keep regression tests, monitor the original advisory, and replace this derivative with a compatible maintained upstream fix when available.
