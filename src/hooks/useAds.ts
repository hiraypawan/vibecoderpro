'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AD_CONFIG } from '@/lib/adConfig';
import { areAdsDisabled } from '@/lib/ads';

// Hook to load Social Bar (always-on passive income)
export function useSocialBar() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || areAdsDisabled()) return;
    loaded.current = true;

    const script = document.createElement('script');
    script.src = AD_CONFIG.socialBar.script;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Don't remove on unmount - let it persist
    };
  }, []);
}

// Hook to load Native Banner in a container
export function useNativeBanner(containerId?: string) {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || areAdsDisabled()) return;
    
    const targetId = containerId || AD_CONFIG.nativeBanner.containerId;
    const container = document.getElementById(targetId);
    if (!container) return;

    loaded.current = true;

    const script = document.createElement('script');
    script.src = AD_CONFIG.nativeBanner.script;
    script.async = true;
    script.dataset.cfasync = 'false';
    container.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, [containerId]);
}

// Hook to trigger Popunder (on specific actions)
export function usePopunder() {
  const lastTrigger = useRef(0);
  const COOLDOWN = 5 * 60 * 1000; // 5 minutes between triggers

  const trigger = useCallback(() => {
    if (areAdsDisabled()) return;
    if (Date.now() - lastTrigger.current < COOLDOWN) return;
    
    lastTrigger.current = Date.now();

    const script = document.createElement('script');
    script.src = AD_CONFIG.popunder.script;
    script.async = true;
    document.body.appendChild(script);

    // Clean up after a few seconds
    setTimeout(() => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 5000);
  }, []);

  return trigger;
}

// Hook to open Smartlink (on export/download clicks)
export function useSmartlink() {
  const open = useCallback(() => {
    if (areAdsDisabled()) return;
    window.open(AD_CONFIG.smartlink.url, '_blank', 'noopener,noreferrer');
  }, []);

  return open;
}

// Hook to open Direct Link (on preview clicks)
export function useDirectLink() {
  const lastIndex = useRef(0);

  const open = useCallback(() => {
    if (areAdsDisabled()) return;
    
    const links = AD_CONFIG.directLinks;
    const link = links[lastIndex.current % links.length];
    lastIndex.current++;
    
    window.open(link, '_blank', 'noopener,noreferrer');
  }, []);

  return open;
}

// Hook to load a banner ad in a container
export function useBannerAd(size: '468x60' | '300x250' | '160x300' | '160x600' | '320x50' | '728x90', containerId: string) {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || areAdsDisabled()) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    loaded.current = true;

    const config = AD_CONFIG.banners[size];
    
    // Create iframe for banner
    const iframe = document.createElement('iframe');
    iframe.style.width = `${config.width}px`;
    iframe.style.height = `${config.height}px`;
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.scrolling = 'no';
    iframe.title = 'Advertisement';
    
    // Create the ad script in iframe
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head><style>body{margin:0;padding:0;overflow:hidden;}</style></head>
        <body>
          <script>atOptions = { key: '${config.key}', format: 'iframe', height: ${config.height}, width: ${config.width}, params: {} };</script>
          <script src="${config.script}"></script>
        </body>
        </html>
      `);
      doc.close();
    }
    
    container.appendChild(iframe);

    return () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };
  }, [size, containerId]);
}
