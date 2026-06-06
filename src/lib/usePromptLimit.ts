'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const ANONYMOUS_LIMIT = Infinity;
const STORAGE_KEY = 'vibe_prompt_count';
const STORAGE_DATE_KEY = 'vibe_prompt_date';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getLocalCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const date = localStorage.getItem(STORAGE_DATE_KEY);
    const count = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    if (date !== getToday()) {
      // New day — reset count
      localStorage.setItem(STORAGE_DATE_KEY, getToday());
      localStorage.setItem(STORAGE_KEY, '0');
      return 0;
    }
    return count;
  } catch {
    return 0;
  }
}

function incrementLocalCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const today = getToday();
    const date = localStorage.getItem(STORAGE_DATE_KEY);
    let count = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    if (date !== today) {
      count = 0;
      localStorage.setItem(STORAGE_DATE_KEY, today);
    }
    count += 1;
    localStorage.setItem(STORAGE_KEY, String(count));
    return count;
  } catch {
    return 0;
  }
}

function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('vibe_anon_id');
  if (!id) {
    id = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('vibe_anon_id', id);
  }
  return id;
}

export function usePromptLimit() {
  const { data: session } = useSession();
  const [remaining, setRemaining] = useState<number>(ANONYMOUS_LIMIT);
  const [isLimited, setIsLimited] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSignedIn = !!session?.user;

  // Initialize from localStorage immediately (no API call needed)
  useEffect(() => {
    if (isSignedIn) {
      setRemaining(Infinity);
      setIsLimited(false);
      return;
    }

    const localCount = getLocalCount();
    const left = Math.max(0, ANONYMOUS_LIMIT - localCount);
    setRemaining(left);
    setIsLimited(left <= 0);

    // Sync with server in background (fire and forget)
    const anonId = getOrCreateAnonymousId();
    fetch('/api/prompts', {
      headers: { 'x-session-id': anonId },
    })
      .then(r => r.json())
      .then(data => {
        // Use server count only if it's higher (more conservative)
        if (data.used > localCount) {
          const serverLeft = Math.max(0, ANONYMOUS_LIMIT - data.used);
          setRemaining(serverLeft);
          setIsLimited(serverLeft <= 0);
          localStorage.setItem(STORAGE_KEY, String(data.used));
          localStorage.setItem(STORAGE_DATE_KEY, getToday());
        }
      })
      .catch(() => {});
  }, [isSignedIn]);

  const trackPrompt = useCallback(async (): Promise<boolean> => {
    if (isSignedIn) return true;

    // Check local count first (instant, no API)
    const localCount = getLocalCount();
    if (localCount >= ANONYMOUS_LIMIT) {
      setRemaining(0);
      setIsLimited(true);
      return false;
    }

    // Increment locally immediately
    const newCount = incrementLocalCount();
    const left = Math.max(0, ANONYMOUS_LIMIT - newCount);
    setRemaining(left);
    setIsLimited(left <= 0);

    // Sync to server in background (fire and forget)
    setLoading(true);
    try {
      const anonId = getOrCreateAnonymousId();
      fetch('/api/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': anonId,
        },
      }).catch(() => {});
    } finally {
      setLoading(false);
    }

    return true;
  }, [isSignedIn]);

  return { remaining, isLimited, isSignedIn, trackPrompt, loading };
}
