'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PwaInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 p-4 bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.25)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
            <span>Install VoiceGuard PWA</span>
            <Sparkles className="w-3 h-3 text-cyan-400" />
          </h4>
          <p className="text-[11px] text-slate-400">
            Instant mobile access & offline-ready SOC alerts
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md flex items-center gap-1 transition-all"
        >
          <Download className="w-3 h-3" />
          Install
        </button>
        <button
          onClick={() => setIsVisible(false)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
          aria-label="Close install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
