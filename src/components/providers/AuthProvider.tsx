'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import React, { useEffect } from 'react';
import { clearAuthState, installAuthInterceptor } from '@/lib/auth-lifecycle';

function AuthLifecycle() {
  const { status } = useSession();

  useEffect(() => {
    installAuthInterceptor();
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      clearAuthState();
    }
  }, [status]);

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthLifecycle />
      {children}
    </SessionProvider>
  );
}
