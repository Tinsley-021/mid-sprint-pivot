import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-amber">404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-paper">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm text-slate-soft">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-2 rounded-md bg-amber px-5 py-3 text-sm font-semibold text-ink hover:bg-amber-dim"
      >
        Back to home
      </Link>
    </div>
  );
}
