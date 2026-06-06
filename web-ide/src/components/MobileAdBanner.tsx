'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { areAdsDisabled } from '@/lib/ads';

const DISMISS_KEY = 'vibe_ad_dismiss_';
const DISMISS_DURATION = 10000; // 10 seconds

interface MobileAdBannerProps {
  id: string;
  position?: 'top' | 'bottom' | 'inline';
  className?: string;
  style?: React.CSSProperties;
}

export default function MobileAdBanner({ id, position = 'bottom', className = '', style }: MobileAdBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    if (areAdsDisabled()) return;
    
    // Check if dismissed recently
    const dismissTime = localStorage.getItem(DISMISS_KEY + id);
    if (dismissTime) {
      const elapsed = Date.now() - parseInt(dismissTime, 10);
      if (elapsed < DISMISS_DURATION) {
        setDismissed(true);
        // Set timer to reappear
        const remaining = DISMISS_DURATION - elapsed;
        const timer = setTimeout(() => {
          setDismissed(false);
          localStorage.removeItem(DISMISS_KEY + id);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        localStorage.removeItem(DISMISS_KEY + id);
      }
    }
  }, [id]);

  // Load Adsterra script into container
  useEffect(() => {
    if (areAdsDisabled() || dismissed || adLoaded) return;
    
    const container = document.getElementById('mobile-ad-' + id);
    if (!container) return;

    // Check if script already loaded
    if (container.querySelector('script')) {
      setAdLoaded(true);
      return;
    }

    // Set atOptions for this ad slot
    const optScript = document.createElement('script');
    optScript.textContent = `window.atOptions = {key:"829c680e8f7d5db7ddb972f3d0a4cf75",format:"iframe",height:50,width:320,params:{}};`;
    container.appendChild(optScript);

    // Load invoke script via rewrite proxy
    const invokeScript = document.createElement('script');
    invokeScript.src = '/ads/829c680e8f7d5db7ddb972f3d0a4cf75/invoke.js';
    invokeScript.async = true;
    container.appendChild(invokeScript);
    setAdLoaded(true);
  }, [id, dismissed, adLoaded]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY + id, String(Date.now()));
    // Reappear after 10 seconds
    setTimeout(() => {
      setDismissed(false);
      setAdLoaded(false);
      localStorage.removeItem(DISMISS_KEY + id);
    }, DISMISS_DURATION);
  }, [id]);

  if (areAdsDisabled() || dismissed) return null;

  const posStyle: React.CSSProperties = position === 'top'
    ? { position: 'fixed', top: '44px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }
    : position === 'bottom'
    ? { position: 'fixed', bottom: '130px', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }
    : {};

  return (
    <div
      className={`relative ${className}`}
      style={{ ...posStyle, ...style }}
    >
      <div
        id={'mobile-ad-' + id}
        style={{
          width: '320px',
          height: '50px',
          overflow: 'hidden',
          borderRadius: '8px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
      />
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(); }}
        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-primary)',
          zIndex: 10,
          touchAction: 'manipulation',
        }}
        title="Dismiss 10s"
      >
        <X size={10} />
      </button>
    </div>
  );
}
