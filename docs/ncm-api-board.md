# NCM API

Started on `admin-redesign` at `4acd0f9a` with the owner's go-ahead.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| N1 · NCM connection and settings | Main and UI/schema helpers | Done | `NCM API: Connection and settings` | Typecheck, lint and 32 focused tests passed. Playwright verified the guarded preview and connected UI fixture at 390, 768, 1024 and 1440 px. Controls measured at least 44 px. |
| N2 · Book with NCM from Dispatch | Main | Pending | | Booking checks, saved attempts, recovery, label, notes and return. |
| N3 · Parcel progress from NCM | Main | Pending | | Verified webhook events, scheduled recovery, courier costs and health. |
| N4 · Final check | Main | Pending | | Full suite, fake courier walk and owner handoff. |

## Implementation plan

- N1. Read the current demo and parcel workflows. Test the documented request shapes and local transport guard. Add a server client, a schema-guarded connection and branch cache, confirmed pickup mappings, a Delivery partners settings panel and paired 0172 sources. Verify missing schema keeps hand booking usable.
- N2. Use the Dispatch record as the server-side source of receiver details, parcel weight and cash due. Save a claim before sending. Tie finalization to the existing parcel booking operation. Keep the claim on ambiguous results and require explicit recovery. Add protected label, note and return actions.
- N3. Store webhook receipts before processing. Use the bulk API to confirm mapped shipment status, and apply compatible transitions through parcel operations. Read open parcels on the same job authorization independently of the email queue. Surface heartbeat data on Delivery partners and Today.
- N4. Run checked preview and disposable fake-server scenarios. Verify regression tests, limits and production isolation. Record owner setup and unresolved vendor contract details below.

## For the owner

- Confirm the official production API base URL with IT@nepalcanmove.com if the connection test fails. The protected application environment selects the production origin.
- Ask IT@nepalcanmove.com for representative `/api/v2/branches` and bulk-status responses, especially the covered-area fields and the status strings for returned to warehouse and exchanges. Unknown status values leave the parcel unchanged for staff review.
- The existing database rule makes the default courier a partner booked by hand. An API-enabled Nepal Can Move partner is available as a separate choice in Dispatch.
- An early test invocation loaded 0172 into a disposable in-memory SQLite fixture through its existing migration loader. That fixture was discarded. The checked database and all MariaDB copies were untouched. Later runs use a fixture guard and explicit in-memory test table definitions.
