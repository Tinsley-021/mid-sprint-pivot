import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth } from '../lib/auth-context.js';
import { createBranch } from '../lib/branches.js';
import { ApiError } from '../lib/api.js';

export default function Onboarding() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', code: '', city: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createBranch(accessToken, form);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-amber">Step 1 of 1</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-paper">Add your first branch</h1>
      <p className="mt-2 text-sm text-slate-soft">
        Every product and order in RetailSync belongs to a branch. Add the first one now \u2014; you can add more,
        or invite staff to manage them, from your dashboard later.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
        <Field
          label="Branch name"
          name="name"
          placeholder="Lagos Central"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Field
          label="Branch code"
          name="code"
          placeholder="LOS-01"
          hint="A short code you\u2019;ll use to identify this branch elsewhere in the system."
          required
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
        />
        <Field
          label="City (optional)"
          name="city"
          placeholder="Lagos"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        />
        {error ? <p className="text-sm text-red">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating\u2026;' : 'Create branch'}
          </Button>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="text-sm text-slate-soft hover:text-paper"
          >
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
