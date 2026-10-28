# Upload validation and browser policy fixes

User approved the findings and implementation on 2026-10-28. Work in the canonical checkout; preserve unrelated changes and retained local data. No deployment, live account operations or COD behavior changes.

Use the existing bounded raster decoder for certificates and return evidence, matching declared MIME types. Parse PDFs structurally instead of trusting their header. Accept passive, unencrypted documents with bounded page/object structure and reject actions, JavaScript, attachments and interactive forms. Preserve original evidence bytes. This is content validation, not antivirus certification. Harden private document response headers.

Use a pinned PDF parser dependency rather than inventing a PDF grammar. Keep the application API's existing validation interface and limits. Existing placeholder PDF test fixtures must become structurally valid documents; retained data is untouched.

- [x] Add failing tests for malformed images/PDFs, mismatched MIME, active/embedded/encrypted PDFs and legitimate passive documents.
- [x] Implement shared content validation and integrate every seller certificate and return upload path.
- [x] Verify private download headers and rejection before storage using isolated route fixtures.
- [x] Tighten CSP only where framework compatibility is demonstrated; document any retained inline-script allowance.
- [x] Run affected tests, typecheck, scoped lint and read-only local preflight. Review final diff and report limitations.

Independent browser-policy implementation owns only CSP/middleware/tests. Primary owns upload validation, dependencies, fixtures and download responses.

## Verification and implementation decisions

- Shared server-only validators live in `lib/uploads/document-content.ts`; routes import them directly so browser application forms do not bundle PDF/image-processing dependencies. Existing MIME/size form checks remain client-compatible.
- Added pinned `pdf-lib` 1.17.1 for structural parsing, following its documented strict object and encryption options. Original file bytes remain private and unchanged.
- Review found decompression before post-parse limits. Ruling: only classic-xref PDFs are accepted; pre-parse decoded-name checks reject object/xref streams and a raw token budget caps dense inputs. The error directs users to Print to PDF or JPG/PNG. This conservative scan includes strings/comments/stream bytes and can reject otherwise legitimate complex PDFs.
- Review found duplicate PDF objects could hide an active catalog from the parser while a reader's xref selects it. Ruling: reject active/external-file names before parsing as well as in parsed dictionaries. Regression tests cover that case, external resource streams, compressed streams, cyclic pages, excessive page counts, forms, attachments, encryption and type mismatches.
- PDFs download as attachments with sandbox/no-sniff headers; image previews remain inline. Both private download routes normalize filename extensions so legacy names cannot suggest executable content.
- CSP now blocks inline event attributes and base-element overrides. Browser fixtures verified production React hydration and events still work. `script-src 'unsafe-inline'` remains; complete nonce integration across production rendering, streaming, navigation and errors is not claimed.
- Tests went red on original validation gaps, PDF review cases and private attachment filenames, then green after fixes. Final combined upload/application/identity/browser/CSP suite: 91/91 passing. Typecheck and scoped lint passed. Read-only local preflight: 89/89 forms ready, sign-in schema ready, canonical checkout and local-staging settings retained.
- No retained database migration/seeding/reset, account changes, external messages, production deployment or commits. Legacy COD behavior is unchanged. Existing uploaded files were not rescanned or altered. This validates accepted content; it is not antivirus certification.
