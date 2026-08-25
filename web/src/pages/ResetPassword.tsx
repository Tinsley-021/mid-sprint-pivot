import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/ui/AuthCard.js';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError } from '../lib/auth-context.js';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthCard eyebrow="Reset password" title="Link missing a token">
        <p className="text-sm text-slate-soft">
          This reset link looks incomplete. Request a new one from the{' '}
          <Link to="/forgot-password" className="text-amber hover:underline">
            forgot password
          </Link>{' '}
          page.
        </p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard eyebrow="Done" title="Password updated">
        <p className="text-sm text-slate-soft">Taking you to log in\u2026;</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Reset password" title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          hint="At least 10 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Updating\u2026;' : 'Update password'}
        </Button>
      </form>
    </AuthCard>
  );
}
