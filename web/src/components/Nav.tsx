import { Link } from 'react-router-dom';
import { Button } from './ui/Button.js';

export function Nav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold text-paper">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-amber text-ink">R</span>
        RetailSync
      </Link>
      <nav className="hidden items-center gap-8 font-mono text-xs uppercase tracking-wider text-slate-soft md:flex">
        <a href="#features" className="hover:text-paper">
          Product
        </a>
        <a href="#how-it-works" className="hover:text-paper">
          How it works
        </a>
        <a href="#pricing" className="hover:text-paper">
          Pricing
        </a>
        <a href="#faq" className="hover:text-paper">
          FAQ
        </a>
      </nav>
      <div className="flex items-center gap-3">
        <Link to="/login">
          <Button variant="ghost" className="px-3 py-2">
            Log in
          </Button>
        </Link>
        <Link to="/register">
          <Button className="px-4 py-2.5">Get started</Button>
        </Link>
      </div>
    </header>
  );
}
