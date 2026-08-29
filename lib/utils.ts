import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getRiskColorClass(level: 'VERIFIED' | 'SUSPICIOUS' | 'HIGH_RISK') {
  switch (level) {
    case 'VERIFIED':
      return {
        text: 'text-cyan-400',
        bg: 'bg-cyan-950/40',
        border: 'border-cyan-500/40',
        glow: 'shadow-[0_0_20px_rgba(6,182,212,0.35)]',
        badge: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
        hex: '#06b6d4',
      };
    case 'SUSPICIOUS':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-500/40',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]',
        badge: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
        hex: '#f59e0b',
      };
    case 'HIGH_RISK':
      return {
        text: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-500/40',
        glow: 'shadow-[0_0_25px_rgba(239,68,68,0.45)]',
        badge: 'bg-red-500/10 text-red-300 border border-red-500/30 animate-pulse',
        hex: '#ef4444',
      };
  }
}
