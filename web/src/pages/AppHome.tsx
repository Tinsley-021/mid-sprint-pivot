import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../lib/auth-context.js';
import { listBranches, type Branch } from '../lib/branches.js';

export default function AppHome() {
  const { user, accessToken, logout, resendVerification } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    listBranches(accessToken)
      .then(setBranches)
      .catch(() => setBranches([]));
  }, [accessToken]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-amber">Signed in</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-paper">Welcome, {user?.name}</h1>
          <p className="mt-1 text-sm text-slate-soft">
            {user?.email} &middot; {user?.role}
          </p>
        </div>
        <Button variant="outline" onClick={() => logout()}>
          Log out
        </Button>
      </div>

      {user && !user.emailVerified ? (
        <div className="mt-6 flex items-center justify-between rounded-lg border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-paper">
          <span>Your email isn\u2019;t verified yet. Check your inbox for a link.</span>
          <button
            onClick={() => resendVerification().then(() => setResent(true))}
            className="font-mono text-xs uppercase tracking-wider text-amber hover:underline"
          >
            {resent ? 'Sent' : 'Resend'}
          </button>
        </div>
      ) : null}

      <div className="mt-10 rounded-xl border border-paper-dim/15 bg-ink-soft p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-paper">Branches</h2>
          <span className="font-mono text-xs text-slate-soft">{branches?.length ?? '\u2026;'}</span>
        </div>
        {branches && branches.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-slate-soft">You haven\u2019;t added a branch yet.</p>
            <Link to="/onboarding" className="mt-2 inline-block text-sm text-amber hover:underline">
              Add your first branch \u2192
            </Link>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-paper-dim/10">
            {branches?.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-paper">{b.name}</span>
                <span className="font-mono text-xs text-slate-soft">{b.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-paper-dim/15 bg-ink-soft p-6">
        <p className="text-sm text-slate-soft">
          This is a placeholder home screen \u2014; the full inventory/orders dashboard is a later phase. Auth,
          sessions, and password security are live and working end to end from here.
        </p>
        <Link to="/app/security" className="mt-4 inline-block text-sm text-amber hover:underline">
          Manage password &amp; security \u2192
        </Link>
      </div>
    </div>
  );
}
