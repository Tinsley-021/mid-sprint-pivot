import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center gap-2 font-display text-lg font-semibold text-paper">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-amber text-ink">R</span>
          RetailSync
        </Link>
        <div className="rounded-xl border border-paper-dim/15 bg-ink-soft p-8 shadow-2xl shadow-black/40">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">{eyebrow}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-paper">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-slate-soft">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <p className="mt-6 text-center text-sm text-slate-soft">{footer}</p> : null}
      </div>
    </div>
  );
}
