import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '../components/ui/AuthCard.js';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError } from '../lib/auth-context.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ organizationName: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form);
      navigate('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="Get started"
      title="Set up your organization"
      subtitle="You\u2019;ll be the owner account \u2014; add branches and staff after this."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-amber hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          label="Business name"
          name="organizationName"
          placeholder="Acme Retail Group"
          required
          value={form.organizationName}
          onChange={(e) => update('organizationName', e.target.value)}
        />
        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          required
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          hint="At least 10 characters."
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
        />
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Creating account\u2026;' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
