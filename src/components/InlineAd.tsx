'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { areAdsDisabled } from '@/lib/ads';

const DISMISS_KEY = 'vibe_inline_ad_dismiss_';
const DISMISS_DURATION = 10000;

interface InlineAdProps {
  id: string;
  format?: 'banner' | 'square';
  className?: string;
}

export default function InlineAd({ id, format = 'banner', className = '' }: InlineAdProps) {
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (areAdsDisabled()) return;
    const dismissTime = localStorage.getItem(DISMISS_KEY + id);
    if (dismissTime) {
      const elapsed = Date.now() - parseInt(dismissTime, 10);
      if (elapsed < DISMISS_DURATION) {
        setDismissed(true);
        const timer = setTimeout(() => {
          setDismissed(false);
          localStorage.removeItem(DISMISS_KEY + id);
        }, DISMISS_DURATION - elapsed);
        return () => clearTimeout(timer);
      } else {
        localStorage.removeItem(DISMISS_KEY + id);
      }
    }
  }, [id]);

  useEffect(() => {
    if (areAdsDisabled() || dismissed || loaded.current || !containerRef.current) return;
    const container = containerRef.current;
    if (container.querySelector('script')) { loaded.current = true; return; }

    const isSquare = format === 'square';
    const key = isSquare ? '8ce8aefef55d37e2f465ecb9b5871823' : '829c680e8f7d5db7ddb972f3d0a4cf75';
    const scriptUrl = isSquare
      ? '/ads/8ce8aefef55d37e2f465ecb9b5871823/invoke.js'
      : '/ads/829c680e8f7d5db7ddb972f3d0a4cf75/invoke.js';
    const w = isSquare ? 300 : 320;
    const h = isSquare ? 250 : 50;

    const opt = document.createElement('script');
    opt.textContent = `window.atOptions = {key:"${key}",format:"iframe",height:${h},width:${w},params:{}};`;
    container.appendChild(opt);

    const s = document.createElement('script');
    s.src = scriptUrl;
    s.async = true;
    container.appendChild(s);
    loaded.current = true;
  }, [id, format, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY + id, String(Date.now()));
    setTimeout(() => { setDismissed(false); loaded.current = false; localStorage.removeItem(DISMISS_KEY + id); }, DISMISS_DURATION);
  };

  if (areAdsDisabled() || dismissed) return null;

  const w = format === 'square' ? 300 : 320;
  const h = format === 'square' ? 250 : 50;

  return (
    <div className={`relative flex justify-center my-2 ${className}`} style={{ minHeight: h }}>
      <div
        ref={containerRef}
        style={{
          width: w,
          height: h,
          overflow: 'hidden',
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      />
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleDismiss(); }}
        className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center"
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-primary)',
          transform: 'translate(25%, -25%)',
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
