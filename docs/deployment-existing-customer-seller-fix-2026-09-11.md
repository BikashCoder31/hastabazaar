# Babal deployment — existing customer seller application fix

Deployed on 2026-09-11 to /home2/hastabaz/hastabazaar-app, production Node 22.23.2, app.cjs.

Release: outputs/hastabazaar-existing-customer-seller-fix-2026-09-11.zip
SHA256: 19582B3A3F0237D4DD151CA84F2DA1608197D383534A55F9C15BD2AC2BDEB235
3180 files matched the tested standalone build. Secret/fixture/reset exclusions verified.

Fresh full backup: /home2/hastabaz/backup-9.11.2026_11-27-02_hastabaz.tar.gz, confirmed available before deployment. Uploaded archive completed 100%; app stopped, archive extracted into application directory, app started. No SQL import, account relinking, role assignment or approval changes performed. Existing environment and uploaded media preserved.

Local: 75 automated tests, TypeScript, production build, MariaDB existing-customer submission regression and password/OTP routing passed. HTTP application submission tested with three documents, ownership mismatch and anonymous rejection, duplicate rejection, Admin approval and same-session seller dashboard access. Desktop/mobile email display passed.

Live: /health returned 200 and marketplaceReady true; /sell returned 200 with corrected Seller account email guidance; anonymous /seller redirected to login. All 22 public-page browser checks passed at 1440px/390px with zero browser errors or overflow. Live account mutations: zero.

The affected email alokniranjan31@gmail.com has an active customer account and identity, but no matching saved seller profile/application. The user confirmed sgdsf is a different business and could not remember the random business name used. Do not assign someone else's approved business. The registration defect is fixed and deployed; actual seller dashboard access for that email remains pending a traceable application and genuine Admin approval.

The architecture file inside the immutable ZIP describes status at packaging (before deployment); this document is the deployment confirmation.
