'use client';

import { useEffect, useRef } from 'react';
import { areAdsDisabled } from '@/lib/ads';
import { AD_CONFIG } from '@/lib/adConfig';

// Social Bar - Always visible at bottom (passive income)
export function SocialBarAd() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || areAdsDisabled()) return;
    loaded.current = true;

    const script = document.createElement('script');
    script.src = AD_CONFIG.socialBar.script;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return null; // Social bar injects itself
}

// Native Banner - In sidebar/panels
interface NativeBannerAdProps {
  containerId?: string;
  className?: string;
}

export function NativeBannerAd({ containerId, className }: NativeBannerAdProps) {
  const loaded = useRef(false);
  const targetId = containerId || AD_CONFIG.nativeBanner.containerId;

  useEffect(() => {
    if (loaded.current || areAdsDisabled()) return;

    const container = document.getElementById(targetId);
    if (!container) return;

    loaded.current = true;

    const script = document.createElement('script');
    script.src = AD_CONFIG.nativeBanner.script;
    script.async = true;
    script.dataset.cfasync = 'false';
    container.appendChild(script);
  }, [targetId]);

  return (
    <div 
      id={targetId} 
      className={className}
      style={{ minHeight: '100px' }}
    />
  );
}

// Banner Ad - Various sizes
interface BannerAdProps {
  size: '468x60' | '300x250' | '160x300' | '160x600' | '320x50' | '728x90';
  className?: string;
}

export function BannerAd({ size, className }: BannerAdProps) {
  const loaded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded.current || areAdsDisabled() || !containerRef.current) return;
    loaded.current = true;

    const config = AD_CONFIG.banners[size];
    const container = containerRef.current;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.width = `${config.width}px`;
    wrapper.style.height = `${config.height}px`;
    wrapper.style.overflow = 'hidden';
    wrapper.style.borderRadius = '4px';

    // Create script tags
    const optionsScript = document.createElement('script');
    optionsScript.textContent = `atOptions = { key: '${config.key}', format: 'iframe', height: ${config.height}, width: ${config.width}, params: {} };`;

    const invokeScript = document.createElement('script');
    invokeScript.src = config.script;
    invokeScript.async = true;

    wrapper.appendChild(optionsScript);
    wrapper.appendChild(invokeScript);
    container.appendChild(wrapper);

    return () => {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    };
  }, [size]);

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ 
        width: AD_CONFIG.banners[size].width,
        height: AD_CONFIG.banners[size].height,
      }}
    />
  );
}

// Smartlink Ad - On export/download clicks
export function SmartlinkAd({ children, className }: { children: React.ReactNode; className?: string }) {
  const handleClick = () => {
    if (!areAdsDisabled()) {
      window.open(AD_CONFIG.smartlink.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div onClick={handleClick} className={className} style={{ cursor: 'pointer' }}>
      {children}
    </div>
  );
}

// Direct Link Ad - Opens on click
interface DirectLinkAdProps {
  index?: number;
  children: React.ReactNode;
  className?: string;
}

export function DirectLinkAd({ index = 0, children, className }: DirectLinkAdProps) {
  const handleClick = () => {
    if (!areAdsDisabled()) {
      const link = AD_CONFIG.directLinks[index % AD_CONFIG.directLinks.length];
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div onClick={handleClick} className={className} style={{ cursor: 'pointer' }}>
      {children}
    </div>
  );
}
