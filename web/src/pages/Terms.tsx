import { Nav } from '../components/Nav.js';
import { Footer } from '../components/Footer.js';

export default function Terms() {
  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-paper">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-soft">Last updated: this is placeholder text \u2014; replace before launch.</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-soft">
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Your account</h2>
            <p className="mt-2">
              You\u2019;re responsible for keeping your login credentials secure and for activity that happens under
              your account. Use a strong, unique password, and let us know right away if you suspect unauthorized
              access.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Acceptable use</h2>
            <p className="mt-2">
              Don\u2019;t use RetailSync to store or process data you don\u2019;t have the right to, or in a way that
              violates applicable law.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Availability</h2>
            <p className="mt-2">
              We aim for high availability but don\u2019;t guarantee uninterrupted access. Scheduled maintenance will
              be communicated where possible.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-paper">Changes</h2>
            <p className="mt-2">
              We may update these terms as the product changes. Material changes will be communicated to account
              owners.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
