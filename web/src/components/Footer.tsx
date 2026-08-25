import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-paper-dim/10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-slate-soft md:flex-row md:items-center">
        <div className="flex items-center gap-2 font-display text-base font-semibold text-paper">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-amber text-ink text-xs">R</span>
          RetailSync
        </div>
        <nav className="flex items-center gap-6 font-mono text-xs uppercase tracking-wider">
          <Link to="/privacy" className="hover:text-paper">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-paper">
            Terms
          </Link>
        </nav>
        <p className="font-mono text-xs">© {new Date().getFullYear()} RetailSync. Built for multi-branch retail.</p>
      </div>
    </footer>
  );
}
