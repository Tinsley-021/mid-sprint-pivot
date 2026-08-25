import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard } from '../components/ui/AuthCard.js';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError } from '../lib/auth-context.js';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthCard eyebrow="Check your email" title="Reset link sent">
        <p className="text-sm leading-relaxed text-slate-soft">
          If an account exists for <span className="text-paper">{email}</span>, we\u2019;ve sent a link to reset
          the password. It expires in 30 minutes.
        </p>
        <Link to="/login" className="mt-6 inline-block text-sm text-amber hover:underline">
          Back to log in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Reset password"
      title="Forgot your password?"
      subtitle="Enter the email on your account and we\u2019;ll send a reset link."
      footer={
        <Link to="/login" className="text-amber hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Sending\u2026;' : 'Send reset link'}
        </Button>
      </form>
    </AuthCard>
  );
}
