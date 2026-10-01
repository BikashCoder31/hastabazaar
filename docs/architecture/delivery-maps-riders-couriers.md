# Delivery maps, own riders and courier assignments

## Scope and customer flow
Checkout and saved addresses have an optional map pin and Use my location. Browser permission is requested only on that action. Customers can tap the map, remove the pin or use the written address if permission, GPS or maps fail. Coordinates are validated as finite pairs and preserved in the checkout address snapshot. Old orders remain unchanged. District, municipality, ward and landmark remain important; pins do not change shipping charges or preparation estimates.

Leaflet is bundled locally. OpenStreetMap raster tiles load only when a map is opened or a current rider map is shown, with visible attribution. No address is submitted for reverse geocoding. Public tile service has no availability guarantee: keep manual address entry and respect https://operations.osmfoundation.org/policies/tiles/ (no offline prefetch/bulk downloads, preserve attribution/referrer/cache behavior). For larger traffic, configure a suitable map service before relying on the public tile service. Application hosting remains Babal.Host.

## Own riders
1. The rider registers a normal Hastabazaar account using password, Google or email code.
2. Admin opens Orders > the order > Delivery assignment, chooses Own rider and enters that registered account email. The current rider email is visible to Admin. Only authorised operations staff can assign/reassign. Assignment itself does not dispatch or mark paid.
3. The rider signs in and opens /rider (also linked as Assigned deliveries from Account). They see only currently assigned active orders and the delivery address/pin. No staff privilege is granted.
4. Admin uses the existing dispatch action when the order is ready. The rider explicitly selects Start location sharing. Browser GPS permission is required; the page/device must remain active. Background tracking is not guaranteed. Start/Stop controls clearly describe sharing with the customer.
5. The latest position is sent at most once every 15 seconds per page; API requests are rate limited and restricted to the assigned account and a dispatched order. Reassignment removes the previous rider's access and clears the position. Stop clears the latest position after any in-flight update. Closing the page attempts cleanup; unavailable network updates expire from customer display after two minutes.
6. Admin still confirms actual delivery and COD collection through the existing controls. Riders do not receive authority to mark payments collected. A database trigger clears location when the order leaves dispatched status.

## Couriers
Admin selects Courier company and saves its name, tracking reference and optional public HTTPS tracking link. The reference is synchronized with existing shipment tracking and prefilled at dispatch. Customers can open the courier tracking page from their protected order. Order status remains based on actual recorded updates. Assignment is at the existing whole-order shipment level; do not imply independent per-seller parcel tracking.

No courier-specific API credentials were supplied or provider selected. Automatic booking, courier webhooks, courier GPS and automated courier status updates are NOT connected. The UI says this explicitly. Once a company is selected, obtain its official API/sandbox documentation, credentials, webhook verification rules and status mapping; implement against the existing shipping provider/fulfillment contracts with signature verification and idempotent event processing. Do not invent positions or delivery times. No paid provider signup or courier messages were performed.

## Customer tracking and privacy
The protected order receipt page polls delivery details every 20 seconds while visible. The endpoint accepts the existing receipt cookie or the owning customer account. Anonymous order-number/email tracking remains limited to coarse order progress; it does not expose GPS. Customer output excludes rider email and customer address. Fresh rider coordinates appear on a map with last update/accuracy; stale or closed-order coordinates are hidden. Courier tracking links are validated HTTPS URLs and open with noreferrer/noopener. Only the latest rider point is stored, not a route history. The public privacy page documents map-provider requests and location sharing.

## Database and deployment
Cumulative ZIP: outputs/hastabazaar-delivery-maps-2026-09-11.zip. Deployed to Babal.Host on 2026-09-11. See [deployment report](deployment-delivery-maps-2026-09-11.md) for backup, checksum and live verification. The immutable ZIP contains the original pre-deployment version of these instructions.

On Babal.Host:
1. Back up the current account and database.
2. Select hastabaz_marketplace explicitly in phpMyAdmin (not information_schema); keep verification queries separate from the migration import. Apply deployment/babal/mariadb-product-deletions.sql if the pending product controls release has not been deployed.
3. Apply deployment/babal/mariadb-delivery-locations.sql BEFORE switching application files. It adds address_locations and delivery_assignments and creates the named position-cleanup trigger. It does not overwrite addresses, orders, authentication, media, wallet or payment data. Both migrations are repeatable; apply only the documented pending changes.
4. Stop Node, extract the cumulative ZIP into /home2/hastabaz/hastabazaar-app, preserve existing environment, media and dependency symlink, then start app.cjs with the existing Node 22 configuration. No extra email, payment or hosting environment variables are needed for manual courier/own-rider operation.
5. Check /health, sign-in, checkout, saved addresses and /rider. Verify with explicitly designated test accounts/order; never mark genuine orders delivered to test. Allow geolocation in the device/browser and avoid blocking geolocation through a site-wide Permissions-Policy.
6. Rollback restores previous application files. Retain the additive tables and trigger; do not import base/reset schema or drop customer data.

The ZIP also contains previous public pages, reviews, order emails, password reset, referrals and pending Archive/Delete/Unpublish features. Earlier packaged documents may describe their historical release status; this release includes their final code.

## Validation
82 automated tests, TypeScript and Babal production build. Tests cover finite coordinates, unsafe URL rejection, pin preservation, unchanged shipping estimates, rider isolation, stale GPS hiding, reassignment and order-close cleanup. scripts/verify-delivery-locations.mjs with outputs/resume-delivery-check.mjs uses only the disposable local MariaDB fixture and verifies desktop/mobile maps, GPS permission, saved pins, rider Start/Stop, customer authorization, unrelated-account rejection and courier handoff. Existing password/OTP routing regression is also run. These functional checks were local. Production passed 22 anonymous desktop/mobile page checks plus health, new privacy content, rider sign-in protection and anonymous delivery endpoint denial after deployment. Real rider-device accuracy, background tracking, courier API and inbox delivery were not verified.
