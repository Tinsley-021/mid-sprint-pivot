import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError, type Session } from '../lib/auth-context.js';

function formatSession(s: Session) {
  const ua = s.userAgent ?? 'Unknown device';
  const short = ua.length > 60 ? `${ua.slice(0, 60)}\u2026;` : ua;
  return short;
}

export default function SecuritySettings() {
  const { user, changePassword, listSessions, revokeSession } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessions, setSessions] = useState<Session[] | null>(null);

  function refreshSessions() {
    listSessions().then(setSessions).catch(() => setSessions([]));
  }

  useEffect(() => {
    refreshSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      setMessage('Password changed. Your other sessions have been signed out.');
      setForm({ currentPassword: '', newPassword: '' });
      refreshSessions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(id: string) {
    await revokeSession(id);
    refreshSessions();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Link to="/app" className="text-xs text-slate-soft hover:text-amber">
        \u2019; Back
      </Link>
      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-amber">Security</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-paper">Change password</h1>
      <p className="mt-2 text-sm text-slate-soft">
        Signed in as {user?.email}. Changing your password signs out every other active session.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
        <Field
          label="Current password"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
        />
        <Field
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={10}
          hint="At least 10 characters."
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
        />
        {error ? <p className="text-sm text-red">{error}</p> : null}
        {message ? <p className="text-sm text-green">{message}</p> : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Updating\u2026;' : 'Update password'}
        </Button>
      </form>

      <div className="mt-12">
        <h2 className="font-display text-lg font-semibold text-paper">Active sessions</h2>
        <p className="mt-1 text-sm text-slate-soft">Devices currently signed in to your account.</p>
        <ul className="mt-4 divide-y divide-paper-dim/10 rounded-lg border border-paper-dim/15">
          {sessions === null ? (
            <li className="px-4 py-3 text-sm text-slate-soft">Loading\u2026;</li>
          ) : sessions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-soft">No other active sessions.</li>
          ) : (
            sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-paper">{formatSession(s)}</p>
                  <p className="font-mono text-xs text-slate-soft">
                    {s.ip ?? 'Unknown IP'} &middot; {s.isCurrent ? 'This device' : new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {!s.isCurrent ? (
                  <button
                    onClick={() => onRevoke(s.id)}
                    className="shrink-0 font-mono text-xs uppercase tracking-wider text-red hover:underline"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="shrink-0 font-mono text-xs uppercase tracking-wider text-green">Active</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
