import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { NetworkStatus } from '@/components/providers/NetworkStatus';
import { InstallPrompt } from '@/components/providers/InstallPrompt';
import { ServiceWorkerRegister } from '@/components/providers/ServiceWorkerRegister';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: 'Vehicle Fleet & Live Tracking',
  description: 'Enterprise vehicle fleet management and live GPS tracking system',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FleetTrack',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 font-sans">
        <ServiceWorkerRegister />
        <AuthProvider>
          <NetworkStatus />
          <InstallPrompt />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
