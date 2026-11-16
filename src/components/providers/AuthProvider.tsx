'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import React, { useEffect } from 'react';
import {
  handleUnauthenticatedStatus,
  installAuthInterceptor,
  onExplicitLogout,
  readLastUserId,
  writeLastUserId,
} from '@/lib/auth-lifecycle';

function AuthLifecycle() {
  const { status, data } = useSession();
  const userId = data?.user?.id;

  useEffect(() => {
    installAuthInterceptor();
  }, []);

  // On unauthenticated: preserve the offline outbox on a network drop (offline).
  useEffect(() => {
    if (status === 'unauthenticated') {
      handleUnauthenticatedStatus();
    }
  }, [status]);

  // A different userId logging in on this browser means the prior user's cached
  // snapshots AND offline outbox are stale/foreign — wipe them.
  useEffect(() => {
    if (status === 'authenticated' && userId) {
      const prev = readLastUserId();
      if (prev && prev !== userId) {
        onExplicitLogout();
      }
      writeLastUserId(userId);
    }
  }, [status, userId]);

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
