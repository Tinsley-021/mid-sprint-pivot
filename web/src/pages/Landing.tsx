import { Link } from 'react-router-dom';
import { Nav } from '../components/Nav.js';
import { Footer } from '../components/Footer.js';
import { LedgerTicker } from '../components/LedgerTicker.js';
import { Button } from '../components/ui/Button.js';

const FEATURES = [
  {
    tag: 'RESERVATION',
    title: 'Stock that can\u2019;t be sold twice',
    body: 'Every order locks the exact quantity it needs before checkout opens. Two staff can\u2019;t sell the last unit to two different customers \u2014; the second one gets told it\u2019;s gone, instantly.',
  },
  {
    tag: 'TRANSFER',
    title: 'Move stock between branches without losing the count',
    body: 'Send 5 units from Lagos to Kaduna and both sides update in the same transaction. Nothing goes missing between "sent" and "received."',
  },
  {
    tag: 'PURCHASE',
    title: 'Every change has a reason attached',
    body: 'Sales, returns, damage, manual counts \u2014; each one writes a permanent line to the ledger with who did it and why. No more "someone must have adjusted it."',
  },
  {
    tag: 'PAYMENT_SUCCESS',
    title: 'Paid means paid',
    body: 'Orders only move to PAID when Paystack confirms it server-side. A customer closing their browser early can\u2019;t trick your stock count into thinking they checked out.',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: '\u20a635,000',
    period: '/month',
    tagline: 'One branch, getting off spreadsheets.',
    features: ['1 branch', 'Up to 3 staff accounts', 'Real-time inventory ledger', 'Email support'],
  },
  {
    name: 'Growth',
    price: '\u20a695,000',
    period: '/month',
    tagline: 'Multiple branches, real payment reconciliation.',
    features: ['Up to 5 branches', 'Unlimited staff accounts', 'Paystack payments & webhooks', 'Stock transfers between branches', 'Priority support'],
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    tagline: 'Large chains with custom reporting needs.',
    features: ['Unlimited branches', 'Role-based access control', 'API access for the support tool', 'Dedicated onboarding'],
  },
] as const;

const FAQS = [
  {
    q: 'How does RetailSync stop two branches from overselling the same item?',
    a: 'Every order reserves stock in the same database transaction that checks availability, with a row-level lock so two simultaneous orders for the last unit can\u2019;t both succeed. One gets confirmed, the other gets told it\u2019;s out of stock \u2014; instantly, not after the fact.',
  },
  {
    q: 'Do I need a developer to set this up?',
    a: 'No. Create an account, add your branches, and start adding products \u2014; no code required. If you want to connect a support tool to check stock via API, that\u2019;s available but optional.',
  },
  {
    q: 'How is my data kept secure?',
    a: 'Passwords are hashed with bcrypt, sessions use short-lived tokens with revocable refresh sessions, and every organization\u2019;s data is isolated at the database layer \u2014; not just hidden in the interface.',
  },
  {
    q: 'What happens if a customer doesn\u2019;t complete payment?',
    a: 'The stock reservation holds for a configurable window (15 minutes by default) and is automatically released back into available inventory if payment isn\u2019;t confirmed in time.',
  },
  {
    q: 'Can I move stock between branches?',
    a: 'Yes \u2014; transfers debit the source branch and credit the destination in one atomic operation, so a transfer can\u2019;t leave stock missing from both sides if something goes wrong mid-transfer.',
  },
] as const;

const STEPS = [
  { n: '1', title: 'Customer orders', body: 'A support agent or cashier creates an order for a specific branch.' },
  { n: '2', title: 'Stock is reserved', body: 'That quantity is held instantly, so nobody else can claim it while payment is pending.' },
  { n: '3', title: 'Payment is confirmed', body: 'A webhook from Paystack \u2014; not the browser \u2014; marks the order paid.' },
  { n: '4', title: 'Every branch sees it', body: 'The reservation becomes a sale, the dashboard updates, and low-stock alerts fire if the threshold is crossed.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-10 md:grid-cols-2 md:pt-20">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-amber">Multi-branch inventory & payments</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] text-paper md:text-5xl">
            Know what\u2019;s on the shelf. In every branch. Right now.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-soft">
            RetailSync is the stock ledger for retail chains that are done guessing. One order can\u2019;t oversell
            two branches, one payment can\u2019;t get counted twice, and nobody has to WhatsApp the Lagos store to
            ask if the iPhone is still there.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/register">
              <Button>Create your account</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline">Log in</Button>
            </Link>
          </div>
          <p className="mt-6 font-mono text-xs text-slate-soft">
            No card required &middot; set up your first branch in minutes
          </p>
        </div>
        <LedgerTicker />
      </section>

      <section id="stats" className="border-y border-paper-dim/10 bg-ink-soft/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 md:grid-cols-4">
          {[
            ['0', 'oversold orders \u2014; the reservation model makes it structurally impossible'],
            ['1', 'transaction row written for every single inventory change'],
            ['15m', 'default hold on a reservation before it\u2019;s released back to stock'],
            ['\u221e', 'branches you can run from one dashboard'],
          ].map(([n, label]) => (
            <div key={label}>
              <div className="font-display text-3xl font-semibold text-amber">{n}</div>
              <p className="mt-1 text-xs text-slate-soft">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">What it does</p>
        <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold text-paper">
          Built around the four things that actually go wrong in multi-branch retail
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-paper-dim/15 bg-paper-dim/10 md:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.tag} className="bg-ink p-8">
              <span className="font-mono text-[11px] uppercase tracking-widest text-amber">{f.tag}</span>
              <h3 className="mt-3 font-display text-lg font-semibold text-paper">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-t border-paper-dim/10 bg-ink-soft/40">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">How it works</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold text-paper">
            From "customer wants it" to "stock reflects it," in one flow
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="font-mono text-3xl font-semibold text-paper-dim">{s.n}</div>
                <h3 className="mt-3 font-display text-base font-semibold text-paper">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-paper-dim/10">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">Pricing</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold text-paper">
            Priced by how many branches you\u2019;re actually running
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-xl border p-8 ${'highlighted' in plan && plan.highlighted
                  ? 'border-amber bg-ink-soft'
                  : 'border-paper-dim/15 bg-ink'
                  }`}
              >
                <h3 className="font-display text-lg font-semibold text-paper">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-soft">{plan.tagline}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold text-paper">{plan.price}</span>
                  <span className="text-sm text-slate-soft">{plan.period}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-soft">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register" className="mt-8">
                  <Button variant={'highlighted' in plan && plan.highlighted ? 'primary' : 'outline'} fullWidth>
                    Get started
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-paper-dim/10 bg-ink-soft/40">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-paper">Common questions</h2>
          <div className="mt-10 divide-y divide-paper-dim/10">
            {FAQS.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-medium text-paper">
                  {item.q}
                  <span className="shrink-0 text-slate-soft transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-xl font-display text-3xl font-semibold text-paper">
          Stop finding out you oversold something after the customer\u2019;s already annoyed.
        </h2>
        <div className="mt-8">
          <Link to="/register">
            <Button>Create your account</Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
