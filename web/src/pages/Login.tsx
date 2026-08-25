import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '../components/ui/AuthCard.js';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError } from '../lib/auth-context.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Log in to your RetailSync dashboard."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="text-amber hover:underline">
            Create an account
          </Link>
        </>
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
        <div>
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link to="/forgot-password" className="mt-2 inline-block text-xs text-slate-soft hover:text-amber">
            Forgot your password?
          </Link>
        </div>
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Signing in\u2026;' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
