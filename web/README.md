# RetailSync — Frontend (Landing + Auth + Management Dashboard)

A Vite + React + TypeScript + Tailwind v4 app — this replaced the old
`@appdeploy/client`-based dashboard shell from the original MVP with something
that runs against the new Express/Postgres backend.

## What's here

- **Landing page** (`src/pages/Landing.tsx`) — hero, feature grid, "how it
  works," **pricing tiers**, and an **FAQ** section addressing the objections
  a retail owner would actually have (overselling, setup complexity, data
  security, payment timeouts, transfers). Design tokens (colors/fonts) live
  in `src/index.css` under `@theme`; the accent colors intentionally match
  the product's own stock-status semantics (amber/green/red), and the hero's
  ledger widget (`src/components/LedgerTicker.tsx`) scrolls through real
  `InventoryTransaction` types from the backend's domain model.
- **Full auth flow** — Login, Register, Forgot/Reset Password, **Email
  verification**, and (signed in) a **Security settings** page with password
  change plus an **active sessions list** you can revoke individual devices
  from.
- **Onboarding** — after signup, a one-step "add your first branch" screen
  before landing on the dashboard, backed by the new `/api/branches`
  endpoints.
- **Management dashboard** (`src/pages/Management.tsx`, the `/app` route) —
  Overview, Inventory, Orders & Payments, Branches, Customers, Support
  Availability, and Alerts, ported from the standalone `retailsync-management`
  prototype onto this app's real auth and design tokens (`src/lib/inventory.ts`
  wraps `/api/products`, `/api/orders`, `/api/alerts`, `/api/availability`;
  `src/lib/customers.ts` wraps `/api/customers`). Includes "Add product"/
  "Restock", "New order", and "Add branch" forms, since a new organization
  starts with none of those. Data refreshes on an interval rather than over a
  socket — see the backend README's Phase 4 notes for why.
- **Team management** (`src/pages/Team.tsx`, `/app/team`, `src/lib/team.ts`)
  — invite teammates by email/role, change an existing member's role, and
  suspend/reactivate access, all gated by the signed-in user's own role
  (`OWNER`/`ADMIN` can manage; everyone can see who's on the team). The top
  bar's avatar is now a real account menu (Team / Security / Log out).
- **Error handling** — a top-level `ErrorBoundary` (`src/components/
  ErrorBoundary.tsx`) around the whole app so a render crash on any page
  shows a recoverable "reload" screen instead of a blank one, and a proper
  404 page (`src/pages/NotFound.tsx`) for unmatched routes.
- **Legal pages** — Privacy Policy and Terms of Service (placeholder copy —
  replace with your actual policies before launch), linked from the footer.
- **SEO** — Open Graph/Twitter meta tags, `robots.txt`, page title/description
  in `index.html`.
- **Auth plumbing** (`src/lib/auth-context.tsx`) — access token kept in React
  state only (never `localStorage`, so an XSS bug can't read a long-lived
  token); the refresh token lives in the `httpOnly` cookie the backend sets
  and is never touched by JS directly. On page load, a silent
  `POST /api/auth/refresh` restores the session from that cookie.

## Running it

```bash
npm install
cp .env.example .env        # point VITE_API_URL at the backend
npm run dev                 # http://localhost:5173
```

Needs the backend running (`retailsync-server`) on the URL in `VITE_API_URL`
(defaults to `http://localhost:4000`) with `CORS_ORIGIN` there set to match
this app's origin.

Both `npm run build` and a full TypeScript typecheck (`npx tsc -b --noEmit`)
were run clean before this was handed to you — this one doesn't have the
Prisma-engine sandbox limitation the backend does, so it's fully verified,
not just written.

## What's next

- Real payment confirmation — orders sit at `PENDING_PAYMENT` until the
  backend's Paystack webhook lands; the dashboard has nothing to poll for
  that yet.
- Genuine realtime updates once the backend has a transport for them, in
  place of the current interval polling.
- Branch-restricted staff — `User.branchIds` already exists on the backend
  for scoping a `CASHIER`/`BRANCH_MANAGER` to specific branches, but neither
  the invite form nor the dashboard's queries filter by it yet.
- 2FA (TOTP) — a natural next security step once the basics above are in use.
- Swap the placeholder Privacy/Terms copy for real policies before launch.
