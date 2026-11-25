import React from 'react';
import { NavBar } from '@/components/layout/NavBar';
import { SkipLink } from '@/components/layout/SkipLink';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex flex-col">
      <SkipLink />
      <NavBar />
      <main id="main-content" tabIndex={-1} className="app-main">
        {children}
      </main>
    </div>
  );
}
