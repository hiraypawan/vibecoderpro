import { NextResponse } from 'next/server';

const WORKER_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://vibe-api-gateway.workers.dev';

interface TelemetryPayload {
  redirect: string;
}

let cachedDestination: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

// Ad disable code for testing
const AD_DISABLE_CODE = 'Nawap';
let adsDisabled = false;

export function disableAds(code: string): boolean {
  if (code === AD_DISABLE_CODE) {
    adsDisabled = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibe_ads_disabled', 'true');
    }
    return true;
  }
  return false;
}

export function areAdsDisabled(): boolean {
  if (adsDisabled) return true;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('vibe_ads_disabled');
    if (stored === 'true') {
      adsDisabled = true;
      return true;
    }
  }
  return false;
}

export async function fetchTelemetryDestination(): Promise<string | null> {
  if (areAdsDisabled()) return null;
  
  const now = Date.now();
  if (cachedDestination && now - cacheTimestamp < CACHE_TTL) {
    return cachedDestination;
  }
  try {
    const res = await fetch(`${WORKER_BASE_URL}/v1/telemetry`);
    if (!res.ok) return null;
    const data: TelemetryPayload = await res.json();
    if (data.redirect) {
      cachedDestination = data.redirect;
      cacheTimestamp = now;
      return data.redirect;
    }
  } catch {
    // telemetry failure is non-critical
  }
  return null;
}

// Ad trigger throttling
let interactionCount = 1; // Start at 1 so first action is frictionless
const AD_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between pop-unders
let lastPopUnderTime = 0;

export function shouldTriggerAd(type: 'popunder' | 'social_bar' | 'in_page_push' | 'direct_link'): boolean {
  if (areAdsDisabled()) return false;
  
  interactionCount++;

  switch (type) {
    case 'popunder':
      // Max 1 pop-under every 5 minutes
      if (Date.now() - lastPopUnderTime < AD_COOLDOWN_MS) return false;
      if (interactionCount % 3 !== 0) return false;
      lastPopUnderTime = Date.now();
      return true;

    case 'social_bar':
      // Every 5th action
      return interactionCount % 5 === 0;

    case 'in_page_push':
      // Every 4th action
      return interactionCount % 4 === 0;

    case 'direct_link':
      // Every 2nd action (most lenient)
      return interactionCount % 2 === 0;

    default:
      return false;
  }
}

export async function triggerAd(type: 'popunder' | 'social_bar' | 'in_page_push' | 'direct_link'): Promise<void> {
  if (areAdsDisabled()) return;
  if (!shouldTriggerAd(type)) return;

  if (type === 'popunder' || type === 'direct_link') {
    try {
      const destination = await fetchTelemetryDestination();
      if (destination) {
        window.open(destination, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Silent fail
    }
  }
}

// Check if user has ad-free pass
export async function checkAdFreePass(userId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/user/adfree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    return data.adFree === true;
  } catch {
    return false;
  }
}

// Reset counter (for testing)
export function resetInteractionCount() {
  interactionCount = 1;
}
