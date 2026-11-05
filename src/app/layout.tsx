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
  themeColor: '#f4f7f5',
};

export const metadata: Metadata = {
  title: 'KCIC Fleet · Live Tracking',
  description: 'Sistem pelacakan armada kendaraan dan driver operasional KCIC',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KCIC Fleet',
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

      </head>
      <body className="min-h-dvh flex flex-col text-zinc-900 font-sans">
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
