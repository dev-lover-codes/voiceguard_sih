import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'VoiceGuard SIH | Real-Time AI Deepfake Voice Fraud Defense',
  description:
    'Client and edge-powered AI deepfake audio detection, synthetic speech vocoder fingerprinting, and real-time live call fraud prevention.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VoiceGuard SIH',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0B1120',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B1120" />
      </head>
      <body className="bg-[#070B14] text-slate-100 min-h-screen flex flex-col antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        <Navbar />
        <main className="flex-1 w-full">{children}</main>
        <PwaInstallPrompt />
        <ServiceWorkerRegister />
        <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500 font-mono">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>VoiceGuard SIH © 2026 • Real-Time Voice Biometric Security</span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-cyan-400">● ONNX Runtime Web</span>
              <span className="text-amber-400">● Supabase Edge Sync</span>
              <span className="text-indigo-400">● PWA Enabled</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
