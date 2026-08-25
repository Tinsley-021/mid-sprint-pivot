import { Nav } from '../components/Nav.js';
import { Footer } from '../components/Footer.js';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-paper">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-soft">Last updated: this is placeholder text \u2014; replace before launch.</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-soft">
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">What we collect</h2>
            <p className="mt-2">
              Account details you provide directly (name, email, organization name), plus operational data your
              organization creates while using RetailSync (branches, products, inventory records, orders, and
              payment references). We do not sell this data.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">How passwords are handled</h2>
            <p className="mt-2">
              Passwords are hashed with bcrypt before storage \u2014; we never store or have access to your plaintext
              password. Password reset and email verification links are single-use and expire automatically.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Sessions</h2>
            <p className="mt-2">
              Signing in issues a short-lived access token and a longer-lived session stored as an httpOnly cookie.
              You can review and revoke individual sessions from your account\u2019;s security settings at any time.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Payments</h2>
            <p className="mt-2">
              Payment processing is handled by Paystack. RetailSync stores payment references and status, not raw
              card details.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Contact</h2>
            <p className="mt-2">
              Questions about this policy: replace this section with your organization\u2019;s real contact details
              before going live.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
