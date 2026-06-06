'use client';

import { useEffect, useRef, useState } from 'react';

// Anti-adblock bypass techniques
const AD_BYPASS_CONFIG = {
  // Use first-party paths that look like app resources
  scriptPaths: [
    '/_next/static/chunks/analytics.js',
    '/_next/static/chunks/telemetry.js',
    '/api/ad-bridge',
  ],
  // Obfuscated container IDs
  containerIds: [
    'vibe-analytics-container',
    'vibe-performance-metrics',
    'vibe-session-tracker',
  ],
};

interface AdBypassProps {
  adFreePass: boolean;
  onAdLoaded?: () => void;
}

export default function AdBypass({ adFreePass, onAdLoaded }: AdBypassProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adBlocked, setAdBlocked] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (adFreePass || initialized) return;

    const detectAdBlocker = async (): Promise<boolean> => {
      try {
        const testAd = document.createElement('div');
        testAd.innerHTML = '&nbsp;';
        testAd.className = 'adsbox ad-banner ad-container';
        testAd.style.cssText = 'position:absolute;top:-999px;left:-999px;width:1px;height:1px;';
        document.body.appendChild(testAd);
        await new Promise((r) => setTimeout(r, 100));
        const blocked = testAd.offsetHeight === 0 || getComputedStyle(testAd).display === 'none';
        document.body.removeChild(testAd);
        return blocked;
      } catch {
        return false;
      }
    };

    const loadAds = async () => {
      const isBlocked = await detectAdBlocker();
      setAdBlocked(isBlocked);

      if (!isBlocked) {
        // Method 1: Load scripts dynamically with random names
        const script = document.createElement('script');
        script.async = true;
        script.dataset.cfasync = 'true';
        // Random attribute name to avoid pattern matching
        const attrName = '_' + Math.random().toString(36).substring(2, 8);
        script.setAttribute(attrName, 'true');
        script.src = '//pl26488700.revenuepmgate.com/d463af0f5895db69e7a57a81c64b4219/invoke.js';
        document.body.appendChild(script);

        // Method 2: Create hidden container for ads
        if (containerRef.current) {
          const adContainer = document.createElement('div');
          adContainer.id = AD_BYPASS_CONFIG.containerIds[0];
          adContainer.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1;pointer-events:auto;';
          containerRef.current.appendChild(adContainer);
        }

        // Method 3: Service Worker registration for ad delivery
        if ('serviceWorker' in navigator) {
          try {
            // Register a minimal service worker that intercepts requests
            const swCode = `
              self.addEventListener('fetch', (event) => {
                if (event.request.url.includes('revenuepmgate') || 
                    event.request.url.includes('adsterra')) {
                  event.respondWith(fetch(event.request));
                }
              });
            `;
            const blob = new Blob([swCode], { type: 'application/javascript' });
            // Note: Service workers must be same-origin, so we skip if not available
          } catch {
            // Silent fail
          }
        }

        onAdLoaded?.();
      }
    };

    // Delay ad loading to avoid detection
    const timer = setTimeout(loadAds, 1500);
    setInitialized(true);

    return () => clearTimeout(timer);
  }, [adFreePass, initialized, onAdLoaded]);

  if (adFreePass) return null;

  return (
    <>
      {/* Hidden container for bottom ads */}
      <div ref={containerRef} className="ad-bypass-container" />

      {/* Social Bar - always visible, hard to block */}
      <div
        className="vibe-social-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1,
          height: 'auto',
          minHeight: '60px',
          pointerEvents: 'auto',
        }}
      >
        {/* This div gets populated by Adsterra script */}
      </div>

      {/* Anti-adblock: Detect if ad was blocked and show fallback */}
      {adBlocked && (
        <div
          className="ad-fallback-notice"
          style={{
            position: 'fixed',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(22, 27, 34, 0.95)',
            border: '1px solid rgba(0, 122, 204, 0.3)',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '11px',
            color: '#8b949e',
            zIndex: 1000,
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: '#58a6ff' }}>♥</span>
          <span>Support Vibe Coder Pro by disabling your ad blocker</span>
          <button
            onClick={() => setAdBlocked(false)}
            style={{
              background: 'rgba(0, 122, 204, 0.2)',
              border: 'none',
              color: '#58a6ff',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}

// Export for use in other components
export function injectAntiAdblockStyles() {
  if (typeof document === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    /* Make ad containers look like legitimate app elements */
    .adsbox, .ad-banner, .ad-container {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      height: auto !important;
      width: auto !important;
      position: static !important;
    }

    /* Rename ad-related classes to app-related names */
    [class*="ad-"] { }
    [id*="ad-"] { }

    /* Make ad containers look like app components */
    .vibe-social-bar,
    .vibe-performance-metrics,
    .vibe-session-tracker {
      display: block !important;
      visibility: visible !important;
    }

    /* Prevent adblocker from hiding containers */
    div[data-vibe-analytics],
    div[data-vibe-metrics] {
      display: block !important;
    }
  `;
  document.head.appendChild(style);
}
