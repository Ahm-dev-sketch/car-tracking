import React from 'react';
import { NavBar } from '@/components/layout/NavBar';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex flex-col">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <NavBar />
      <main id="main-content" tabIndex={-1} className="app-main">
        {children}
      </main>
    </div>
  );
}
