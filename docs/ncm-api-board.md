# NCM API

Started on `admin-redesign` at `4acd0f9a` with the owner's go-ahead.

| Task | Owner | Status | Commit | Checks |
| --- | --- | --- | --- | --- |
| N1 · NCM connection and settings | Main and UI/schema helpers | Done | `93ddd677` | Typecheck, lint and 32 focused tests passed. Playwright verified the guarded preview and connected UI fixture at 390, 768, 1024 and 1440 px. Controls measured at least 44 px. |
| N2 · Book with NCM from Dispatch | Main and UI helper | Done | `ced23f16` | Typecheck and lint passed for N2. Loopback NCM tests covered the reviewed payload, success, ambiguity, verified recovery and field errors. Playwright passed four widths for hand booking, NCM review and recovery. |
| N3 · Parcel progress from NCM | Main and progress helpers | Done | `bc10f988` | Typecheck, lint and 22 focused tests passed. Fake NCM delivery created a Courier cash entry with zero remitted. Verified comments and refund or exchange requests created review tasks once. Chromium checked the health warning, staff timeline and customer tracking at all four widths. |
| N4 · Final check | Main | Done | `NCM API: Final check` | Typecheck, lint, 72 focused tests, readiness and browser checks passed. Full run: 5,855 passed, 2 form inventory failures, 38 skipped. Both failures passed on the updated code. |

## Implementation plan

- N1. Read the current demo and parcel workflows. Test the documented request shapes and local transport guard. Add a server client, a schema-guarded connection and branch cache, confirmed pickup mappings, a Delivery partners settings panel and paired 0172 sources. Verify missing schema keeps hand booking usable.
- N2. Use the Dispatch record as the server-side source of receiver details, parcel weight and cash due. Save a claim before sending. Tie finalization to the existing parcel booking operation. Keep the claim on ambiguous results and require explicit recovery. Add protected label, note and return actions.
- N3. Store webhook receipts before processing. Use the bulk API to confirm mapped shipment status, and apply compatible transitions through parcel operations. Read open parcels on the same job authorization independently of the email queue. Surface heartbeat data on Delivery partners and Today.
- N4. Run checked preview and disposable fake-server scenarios. Verify regression tests, limits and production isolation. Record owner setup and unresolved vendor contract details below.

## For the owner

### Set up NCM on Babal.Host

1. In the protected environment settings for the Hastabazaar app, add `NCM_API_TOKEN`, `NCM_API_BASE_URL` and `NCM_WEBHOOK_KEY`. Use the vendor-issued token and the vendor-confirmed HTTPS API origin. The site reads these values from the app environment. If Test connection fails, confirm the production address and token permissions with IT@nepalcanmove.com.
2. Generate the webhook key on an owner-controlled machine. This example saves a 43-character random key to a private file. Substitute a protected directory outside the project and copy the value into the app environment and the NCM portal.

   ```sh
   (umask 077 && node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url")+"\n")' > '<PRIVATE_DIRECTORY>/ncm-webhook-key')
   ```

3. After confirming 0171 is present, apply 0172 to the owner-approved database. Choose the command for the runtime and the target you intend to update.

   ```sh
   npx wrangler d1 execute '<APPROVED_D1_DATABASE>' --remote --file=drizzle/0172_ncm_api.sql
   mariadb --defaults-extra-file='<STAGING_CLIENT_CONFIG>' --database=hastabaz_staging --comments --binary-mode=1 < deployment/babal/mariadb-ncm-api.sql
   mariadb --defaults-extra-file='<PRODUCTION_CLIENT_CONFIG>' --database=hastabaz_marketplace --comments --binary-mode=1 < deployment/babal/mariadb-ncm-api.sql
   ```

4. In Orders › Delivery partners, choose Nepal Can Move. Select **Test connection**, confirm the assigned pickup branches and select **Refresh branches**. Set the delivery type and package name. Confirm the pickup branch for each seller address you want to use. Set Nepal Can Move to **In use** and its booking mode to **API**. Upaya stays **By hand**. The NCM **Book by hand** choice remains available for parcels with no active or unresolved API booking.
5. In NCM portal › API Integration, set **Order Delivery Webhook URL** and **Order Comment Webhook URL** to the matching paths below. Enter the key generated in step 2 in place of the placeholder, then press **Test Webhook**. Configure access and error logs to omit query strings on both webhook paths before setting the URLs. For staging, configure Basic Auth pass-through for these two POST paths and the NCM job POST, like the existing email job route. The webhook key and job secret still authenticate their respective requests.

   ```text
   https://<APP_HOST>/api/webhooks/ncm/delivery?key=<NCM_WEBHOOK_KEY>
   https://<APP_HOST>/api/webhooks/ncm/comments?key=<NCM_WEBHOOK_KEY>
   ```

6. Set up a separate 15-minute cron entry. Use the same `ORDER_EMAIL_JOB_SECRET` as the email job and load it from a protected environment file. The command returns only success or failure to cron. Substitute the approved Node binary, file and application host.

   ```cron
   */15 * * * * <NODE_BINARY> --env-file=<PRIVATE_JOB_ENV_FILE> -e 'if(!process.env.ORDER_EMAIL_JOB_SECRET)process.exit(1);fetch("https://<APP_HOST>/api/jobs/ncm-updates",{method:"POST",headers:{authorization:"Bearer "+process.env.ORDER_EMAIL_JOB_SECRET},redirect:"error",signal:AbortSignal.timeout(55000)}).then(r=>{process.exitCode=r.ok?0:1},()=>{process.exitCode=1})'
   ```

7. Before using API booking for customer orders, book **one real test parcel** with a consenting recipient. Review the weight, cash due and destination in Dispatch, then print the label. Confirm progression on the staff order and customer tracking, and check that any COD waits for transfer matching in Courier cash. Delivery partners shows the last webhook and last successful check.

### Verification notes

- The checked local preview passed the 107/107 form and sign-in readiness checks. Today, Delivery partners, Dispatch and Courier cash fit at 390, 768, 1024 and 1440 px, and the pre-migration preview kept the NCM controls hidden.
- Separate Chromium fixtures checked connection and branch setup, single and batch booking, ambiguous recovery with API mode turned off, the printable label, the Today warning, and the staff and customer shipment timelines at all four widths. The label prints on one A6 page with the staff navigation hidden. The fixtures intercepted browser requests. Backend integration tests used a loopback NCM endpoint and disposable order data.
- The final review added guards for unresolved bookings and COD changes during cancellation, and retained return details when NCM's bulk status lagged behind a webhook. No production NCM calls were made.
- The full run covered 5,895 npm and CI tests. The two early form inventory failures were resolved by registering the native NCM controls as fixed forms. Both passed in the 72-test rerun on the final code, which also covered Dispatch, Courier cash, webhooks and return charges. The 38 skipped tests include cases that require separate native database or host fixtures.
- Confirm the official production API base URL with IT@nepalcanmove.com if the connection test fails. The protected application environment selects the production origin.
- Ask IT@nepalcanmove.com for representative `/api/v2/branches`, label and bulk-status responses, especially the covered-area fields, printable label field names and the status strings for returned to warehouse and exchanges. Unknown status values leave the parcel unchanged for staff review.
- Ask NCM IT which nested field identifies the original order on refund and exchange events, the maximum order IDs per webhook and the authoritative way to look up the return charge and reason when the webhook was missed.
- The existing database rule makes the default courier a partner booked by hand. An API-enabled Nepal Can Move partner is available as a separate choice in Dispatch.
- Early test invocations loaded 0172 into disposable in-memory SQLite fixtures through their existing migration loader. Those fixtures were discarded. The checked database and MariaDB copies were untouched. The verification runs use a fixture guard and explicit in-memory test table definitions.
- A split order uses a distinct HB courier reference for each seller parcel. The check panel shows the original order number as well. The app caps direct bookings at 500 requests per Nepal calendar day to leave room under the documented limit.
- A confirmed delivery with the same COD amount as the parcel records collection under Nepal Can Move. Staff still match the actual transfer in Courier cash. A reported amount that differs is kept on the order timeline for review. The returned-parcel charge is shown as reported evidence, since NCM's order details guide only specifies the outbound fee.
- The optional demo booking was skipped because `NCM_DEMO_API_TOKEN` was unset. Booking and webhook tests used loopback NCM servers and fictional records.

NCM API complete — ready for your review
