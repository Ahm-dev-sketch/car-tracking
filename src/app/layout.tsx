import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { NetworkStatus } from '@/components/providers/NetworkStatus';
import { InstallPrompt } from '@/components/providers/InstallPrompt';
import { ServiceWorkerRegister } from '@/components/providers/ServiceWorkerRegister';
import { LaunchSplash } from '@/components/providers/LaunchSplash';
import { MotionProvider } from '@/components/providers/MotionProvider';
import { SmoothScrollProvider } from '@/components/providers/SmoothScrollProvider';
import { LanguageProvider } from '@/components/providers/LanguageProvider';
import { getServerLocale } from '@/lib/i18n/server';

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
  themeColor: '#F8FAFC',
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://car-tracking-one.vercel.app'
  ),
  // plain string: offline layout sets a standalone full title ('Offline | Vehicle Tracking')
  title: 'KCIC Fleet · Live Tracking',
  description: 'Sistem pelacakan armada kendaraan dan driver operasional KCIC',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KCIC Fleet',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'KCIC Fleet',
    title: 'KCIC Fleet · Live Tracking',
    description: 'Sistem pelacakan armada kendaraan dan driver operasional KCIC',
    locale: 'id_ID',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KCIC Fleet · Live Tracking',
    description: 'Sistem pelacakan armada kendaraan dan driver operasional KCIC',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getServerLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-dvh flex flex-col text-slate-900 font-sans">
        <LanguageProvider initialLocale={locale}>
          <LaunchSplash />
          <ServiceWorkerRegister />
          <AuthProvider>
            <NetworkStatus />
            <InstallPrompt />
            <MotionProvider>
              <SmoothScrollProvider>{children}</SmoothScrollProvider>
            </MotionProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
