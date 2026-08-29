'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const ServiceWorkerRegister: React.FC = () => {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !navigator.onLine;
    }
    return false;
  });
  const [swRegistered, setSwRegistered] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Register Service Worker
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker
            .register('/sw.js')
            .then((registration) => {
              setSwRegistered(true);
              // Handle updatefound if a new service worker is installed
              registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker) {
                  installingWorker.onstatechange = () => {
                    if (
                      installingWorker.state === 'installed' &&
                      navigator.serviceWorker.controller
                    ) {
                      // Precached assets updated
                    }
                  };
                }
              };
            })
            .catch(() => {
              // Service worker registration ignored in unsupported contexts
            });
        });
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  if (!isOffline && !swRegistered) return null;

  return (
    <>
      {/* Offline Status Floating Pill */}
      {isOffline && (
        <div className="fixed bottom-4 left-4 z-50 px-3.5 py-2 rounded-xl bg-amber-950/90 border border-amber-500/80 text-amber-200 shadow-[0_0_25px_rgba(245,158,11,0.3)] backdrop-blur-md flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2">
          <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Offline Mode Active • Local WASM Acoustic Inference Running</span>
        </div>
      )}
    </>
  );
};
