import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/ui/AuthCard.js';
import { useAuth, ApiError } from '../lib/auth-context.js';

export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'checking' | 'done' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('This verification link is missing its token.');
      return;
    }
    verifyEmail(token)
      .then(() => setState('done'))
      .catch((err) => {
        setState('error');
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'checking') {
    return (
      <AuthCard eyebrow="Verifying" title="Confirming your email\u2026;">
        <p className="text-sm text-slate-soft">One moment.</p>
      </AuthCard>
    );
  }

  if (state === 'error') {
    return (
      <AuthCard eyebrow="Verification" title="That link didn\u2019;t work">
        <p className="text-sm text-slate-soft">{error}</p>
        <Link to="/app" className="mt-6 inline-block text-sm text-amber hover:underline">
          Go to your dashboard \u2014; you can request a new link from there
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Verified" title="Email confirmed">
      <p className="text-sm text-slate-soft">Your email address is verified.</p>
      <Link to="/app" className="mt-6 inline-block text-sm text-amber hover:underline">
        Continue to your dashboard \u2192
      </Link>
    </AuthCard>
  );
}
