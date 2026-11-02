'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: email.trim().toLowerCase(),
        password,
      });

      if (!res || res.error) {
        setError('Invalid email or password');
        setIsLoading(false);
        return;
      }

      // Fetch user role to route appropriately
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const { user } = await meRes.json();
        if (callbackUrl && !callbackUrl.startsWith('/login')) {
          router.push(callbackUrl);
        } else if (user?.role === 'ADMIN') {
          router.push('/admin');
        } else if (user?.role === 'DRIVER') {
          router.push('/driver');
        } else {
          router.push('/user');
        }
      } else {
        router.push('/user');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg shadow-sm p-8">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-zinc-900 text-white font-mono font-bold text-base mb-3">
          F
        </div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Fleet Operations</h1>
        <p className="text-xs text-zinc-500 mt-1">Vehicle Fleet & Live Tracking System</p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 mb-1"
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operator@company.internal"
            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800 focus:border-zinc-800"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isLoading && <Spinner size="sm" className="text-white" />}
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-6 border-t border-zinc-100 pt-4 text-center">
        <p className="text-xs text-zinc-500">
          Internal corporate tool. Accounts are provisioned by fleet administration.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<Spinner size="lg" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
