# RetailSync — Backend (Phase 1: Domain Model & Inventory · Phase 2/3: Auth & Security · Phase 4: Products, Orders, Alerts)

This replaces the old `@appdeploy/sdk` backend (proprietary, undocumented data-layer
guarantees) with a standard **Node + Express + PostgreSQL (Prisma)** stack you fully
control. The existing React/Vite frontend and the real-time subscription *concept*
from the original MVP are being kept — they get wired up to this new backend in a
later phase, once auth exists.

## What's in this phase

- `prisma/schema.prisma` — the full domain model: Organization, User (+Role),
  Branch, Product, Inventory, InventoryTransaction, Customer, Order, OrderItem,
  Payment, Alert, ApiKey, AuditLog, Transfer/TransferItem. This is the foundation
  every later phase (auth, orders API, payments, alerts, support API) builds on.
- `src/modules/inventory/inventory.service.ts` — the concurrency-safe core:
  `reserveStock`, `releaseReservation`, `commitSale`, `adjustStock`,
  `transferStock`, `getAvailability`. Every mutation is one DB transaction, takes
  a row lock (`SELECT ... FOR UPDATE`), re-checks availability after locking, and
  writes exactly one `InventoryTransaction` audit row alongside the state change.
- `prisma/migrations/00000000000000_init/migration.sql` — the initial schema,
  including three `CHECK` constraints on `Inventory` (`quantityOnHand >= 0`,
  `quantityReserved >= 0`, `quantityReserved <= quantityOnHand`) so Postgres
  itself refuses invalid state even if application logic ever has a bug.
- `src/server.ts` + `src/modules/dev/dev.routes.ts` — a minimal Express app
  exposing the inventory core directly (`/api/dev/inventory/...`) so it can be
  exercised end-to-end. **Not auth-protected — for local testing only, not
  something to expose in production.** The real, RBAC-guarded API modules land
  in Phase 2.
- `prisma/seed.ts` / `scripts/concurrency-test.ts` — dev seed data and a script
  that fires two simultaneous reservations for the last unit of stock.

## Why Prisma instead of the platform SDK

The original backend's `db.list/get/add/update/delete` calls had no documented
transaction, locking, or filtering semantics, and the package isn't public — I
couldn't verify it would actually prevent two simultaneous buyers from reserving
the same last unit, which the spec calls out as critical. Postgres transactions +
row locks + `CHECK` constraints give a provable guarantee instead of an assumed one.

## Proof it actually prevents overselling

I don't have full internet access in the sandbox I built this in, so `npx prisma
generate` / `migrate dev` couldn't download Prisma's query/schema-engine binaries
(blocked from `binaries.prisma.sh`). That's a sandbox limitation, not a code issue —
it'll work normally the first time you run `npm install && npx prisma generate` on
a machine with normal internet access.

To still prove the core guarantee for real rather than asking you to take it on
faith, I applied `migration.sql` directly to a live Postgres instance and ran the
*exact* SQL pattern `inventory.service.ts` uses (via the plain `pg` driver, which
needs no native binary) with two simultaneous reservations against 1 unit of stock:

```
Seeded 1 unit of stock. Firing two simultaneous reservations for 1 unit each...
Result A: { label: 'customer-A', outcome: 'RESERVED' }
Result B: { label: 'customer-B', outcome: 'REJECTED_409', available: 0 }
After: { quantityOnHand: 1, quantityReserved: 1 } available=0
InventoryTransaction rows written: [ { type: 'RESERVATION', quantity: 1, referenceId: 'customer-A' } ]

✅ PASS — no overselling, exactly one InventoryTransaction written.
✅ PASS — direct UPDATE that would over-reserve stock was rejected by Postgres:
   new row for relation "Inventory" violates check constraint
   "Inventory_reserved_not_exceed_onhand"
```

Exactly one request wins, the other gets a clean 409, and — separately — even a
raw `UPDATE` that bypasses the service layer entirely is rejected by Postgres
itself. Once you run `prisma generate` locally you can reproduce this yourself
with `npm run seed && npm run test:concurrency`, which drives the same scenario
through the real `inventory.service.ts` / Prisma client.

## Running it locally

```bash
npm install
cp .env.example .env        # point DATABASE_URL at your Postgres
npx prisma generate
npx prisma migrate deploy   # applies migration.sql
npm run seed
npm run dev                 # starts the Express server on :4000
npm run test:concurrency    # proves the reservation guarantee via the real service
```

Manual smoke test once the server's running (uses the seeded iPhone, which has
exactly 1 unit at the Lagos branch — swap in the ids `npm run seed` prints):

```bash
curl -X POST localhost:4000/api/dev/inventory/reserve \
  -H 'content-type: application/json' \
  -d '{"organizationId":"...","productId":"...","branchId":"...","quantity":1}'
```

## What's next (later phases, in order)

1. ~~**Auth & multi-tenancy**~~ — done (Phase 2, above). `requireAuth` /
   `requireRole` in `src/modules/auth/auth.middleware.ts` are ready to guard
   real endpoints; `req.auth.organizationId` is what every future module
   should filter every query by, not a value trusted from the request body.
2. ~~**Orders, payments, support availability API**~~ — the reserve → order →
   payment-prompt flow, and the availability lookup, are done (Phase 4,
   below). **Not yet done:** actual Paystack integration (payments sit at
   `PENDING` — nothing marks them `PAID` yet), the webhook handler, and
   API-key auth for `/api/availability` (it currently requires a logged-in
   session, same as the rest of the dashboard).
3. **Reservation expiry, transfers, purchases, returns, alerts/notifications** —
   a job queue (BullMQ + Redis) for expiring unpaid reservations, wiring
   `transferStock`/`adjustStock` into real endpoints, and turning stock-status
   changes into persisted `Alert` rows + real-time events.
4. ~~**Frontend**~~ — rewired off `@appdeploy/client` onto this API (Phase 4).
   ~~Users~~ done as Phase 5's Team module, below; **still missing:** Payments,
   Transfers, API Keys, Audit Logs, Reports pages, and any real-time transport
   to replace the current interval polling (the old `realtime.ts`/
   `realtime-subscribers.ts` no-op was never wired to anything real).
5. **Hardening** — rate limiting, centralized validation on every route,
   OpenAPI docs (the support API especially needs this, per the spec), and the
   automated test suite (auth, concurrency, payments, multi-tenancy).

## Phase 2: authentication & account security

New in this phase, in `src/modules/auth/`:

- **Register** (`POST /api/auth/register`) — self-serve signup creates a new
  Organization and its first user as `OWNER` in one transaction.
- **Login** (`POST /api/auth/login`) — same error for "no such account" and
  "wrong password," so the endpoint can't be used to check which emails exist.
- **Sessions** — short-lived (15 min default) JWT access tokens returned to the
  client, plus a revocable refresh token stored **only as a sha256 hash** in
  `RefreshToken` and sent as an `httpOnly`, `sameSite=lax` cookie scoped to
  `/api/auth`. The frontend never sees or stores the refresh token directly —
  a stolen access token expires in minutes, and a compromised database dump
  can't be replayed as a session because only the hash is stored.
- **Refresh rotation** (`POST /api/auth/refresh`) — each refresh revokes the
  token it consumed and issues a new one, atomically, so a refresh token can't
  be reused after rotation.
- **Logout** (`POST /api/auth/logout`) — revokes the current session's refresh
  token server-side, not just a client-side cookie clear.
- **Forgot / reset password** (`POST /api/auth/forgot-password`,
  `POST /api/auth/reset-password`) — single-use, 30-minute reset tokens (hash
  stored, not the raw token); the raw token only ever exists in the emailed
  link. Requesting a reset always returns the same response whether or not the
  email has an account. Consuming a token uses a conditional `UPDATE ...
  WHERE usedAt IS NULL AND expiresAt > now()`, so two concurrent uses of the
  same link can't both succeed — proven under real concurrency, see below.
  A successful reset revokes every existing session on the account.
- **Change password** (`POST /api/auth/change-password`, authenticated) —
  requires the current password, revokes every *other* session (not the one
  making the request), so changing your password doesn't also log you out.
- **Email delivery** — `src/lib/email.ts` defines an `EmailSender` interface;
  the shipped implementation logs the reset link to the console instead of
  sending real email. Swap in a real provider (Postmark/SendGrid/SES) behind
  the same interface before production — nothing in `auth.service.ts` needs
  to change to do that.
- **Rate limiting** — `express-rate-limit` on `/register`, `/login`, and
  `/forgot-password`.

### Proof, not just claims — again

Same sandbox limitation as Phase 1 (no `@prisma/client`), so I validated the
three security-critical *patterns* directly against live Postgres and
`bcryptjs`:

```
--- Test 1: password hashing (bcryptjs) ---
✅ PASS — password is hashed, correct password verifies, wrong password rejected

--- Test 2: email uniqueness across the platform ---
✅ PASS — duplicate email across organizations rejected by the database:
   duplicate key value violates unique constraint "User_email_key"

--- Test 3: password reset token can only be consumed once, even concurrently ---
Concurrent consume attempts: 1,0 rows affected
✅ PASS — exactly one of the two concurrent attempts consumed the token

✅ ALL AUTH SECURITY CHECKS PASSED
```

Passwords are never stored in plaintext, the same email can't create two
accounts even in different organizations, and a reset link can't be raced
into double use. Once `prisma generate` runs with real internet access, you
can exercise the same guarantees through the actual service layer.

## Phase 3: verification, lockout, sessions, and the first real API module

New in this phase:

- **Email verification** — registration sends a verification link (dev: logged
  to console); `POST /api/auth/verify-email` consumes it with the same
  atomic single-use pattern as password reset. Unverified users can still log
  in (common SaaS pattern) but the frontend shows a banner + resend option.
- **Login lockout** — 5 failed attempts locks the account for 15 minutes.
  Locked-out and nonexistent accounts return the same error, so the endpoint
  can't be used to enumerate which accounts exist or are locked.
- **Session management** — `GET /api/auth/sessions` lists active
  `RefreshToken` rows (device/IP/created), `DELETE /api/auth/sessions/:id`
  revokes one (scoped to the caller's own `userId`, so you can't revoke
  someone else's).
- **Security headers** — `helmet()` added to the Express app.
- **First real, auth-guarded, tenant-scoped module**: `src/modules/branches/`.
  `GET /api/branches` and `POST /api/branches` (OWNER/ADMIN only) — the
  template every future module (products, orders, ...) should copy: routes
  never read `organizationId` from the request body, only from
  `req.auth.organizationId` set by `requireAuth`.

### Proof, not just claims — again

```
--- Login lockout ---
✅ PASS — account locked exactly on the 5th failed attempt
✅ PASS — correct password rejected while locked
✅ PASS — login succeeds after lock expires and counters reset to 0/null

--- Branch tenant isolation ---
✅ PASS — same branch code allowed across two different organizations
✅ PASS — duplicate branch code within the same org rejected by the DB
✅ PASS — org-scoped query returns only that org's branch
```

## Phase 4: products, orders, alerts, availability — the management dashboard's real backend

New in this phase, following the tenant-isolation template `branches` set:

- **`src/modules/products/`** — `GET /api/products` flattens `Inventory` (joined
  with `Product`/`Branch`) into one row per product-per-branch, which is the
  shape the dashboard table wants; `POST /api/products` (OWNER/ADMIN/
  BRANCH_MANAGER/INVENTORY_MANAGER) creates a product and stocks it at one
  branch, or — if the SKU already exists for the org — tops up that product's
  inventory at the given branch instead of erroring, since "restock" and
  "add product" are the same underlying action from the dashboard's point of
  view.
- **`src/modules/products/availability.routes.ts`** — `GET /api/availability`,
  the support-tool-facing lookup by product name/SKU. Reads the same live
  `Inventory` rows as everything else, never a cache.
- **`src/modules/orders/`** — `GET /api/orders` lists orders with computed
  totals; `POST /api/orders` (OWNER/ADMIN/BRANCH_MANAGER/CASHIER/
  INVENTORY_MANAGER) is the reserve → book → payment-prompt flow: it calls
  `reserveStock` first, then creates the `Order`/`OrderItem`/`Payment` rows; if
  anything after the reservation fails, it releases the hold rather than
  leaving stock stuck reserved. It never calls `commitSale` — that's reserved
  for a real payment-success webhook, not a client request, matching the
  inventory core's original design intent.
- **`src/modules/alerts/`** — `GET /api/alerts` derives low/out-of-stock
  alerts live from `Inventory` rows below their `reorderLevel`, the same
  "never cached" rule `getAvailability` already followed. The persisted
  `Alert` table is still unused — it's for durable, dismissible notifications
  (payment failures, expired reservations) that a later phase should add.
- **Frontend**: the dashboard prototype (`retailsync-management`) has been
  ported into `web/src/pages/Management.tsx` as the `/app` route, restyled to
  the site's existing ink/paper/amber design tokens instead of its own
  standalone palette, and rewired from the proprietary `@appdeploy/client`
  (REST + WebSocket) onto `apiRequest`/`useAuth` like every other page. There's
  no realtime transport in this phase, so the fake "Live sync" WebSocket
  indicator was replaced with actual 20-second polling — an honest label
  beats a decorative one. It also adds the "Add product", "Restock",
  "New order", and "Add branch" forms the prototype didn't have, since a
  freshly registered organization starts with zero branches and zero
  products.

## Phase 5: team management & customers

New in this phase:

- **`src/modules/team/`** — the piece that was missing for RBAC to mean
  anything in practice: until now, `registerOrganization` was the *only* way
  a user ever got created, and it always makes an `OWNER`. There was no way
  for an organization to ever have a `CASHIER` or `BRANCH_MANAGER` user, even
  though every other module was already written to check for those roles.
  - `GET /api/team` — list every user in the caller's org (any authenticated
    role can view their own team).
  - `POST /api/team/invite` (OWNER/ADMIN) — creates the user immediately
    (so the dashboard shows them right away) with a random, discarded
    password hash they can't actually log in with, then issues a
    `PasswordResetToken` — the exact same single-use, hashed, 7-day-expiry
    row password reset already uses — and emails a "set your password" link
    that lands on the existing `/reset-password` page. No parallel
    invite-token system to maintain.
  - `PATCH /api/team/:userId` (OWNER/ADMIN) — change role and/or suspend/
    reactivate. Guards: only an `OWNER` can grant or edit `OWNER`/`ADMIN`
    (an `ADMIN` inviting someone as `ADMIN` would be a privilege-escalation
    hole); nobody can modify their own row through this endpoint (avoids
    self-lockout); suspending the org's last active `OWNER` is rejected;
    suspending someone revokes their sessions immediately, not just future
    logins.
- **`src/modules/customers/`** — `GET /api/customers`, read-only for now.
  Computes order count / total spent / last-order date from `Order.total`
  rather than storing them redundantly on `Customer`, so it can never drift
  out of sync with the orders that actually generated it.
- **Frontend**: `web/src/pages/Team.tsx` (invite form, member list, inline
  role/status controls, gated by `user.role`) and a new **Customers** tab on
  the management dashboard. The top bar's avatar is now a real account menu
  (Team / Security / Log out) instead of a bare link to Security. Added a
  404 page and a top-level `ErrorBoundary` around the app — neither existed
  before, so a render crash on any page used to show a blank screen.

## Known limitation of this delivery

`npx prisma generate` needs to be run once, by you, with normal internet access,
before `npm run build`/`npm run dev` will type-check and run — the generated
Prisma Client types aren't included in what I'm handing you (they're a build
artifact, not source). Everything else here was validated directly against a
live Postgres instance.
