'use client';

import { useState, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { LogIn, LogOut, EyeOff } from 'lucide-react';
import { disableAds, areAdsDisabled } from '@/lib/ads';

interface LoginButtonProps {
  isMobile?: boolean;
  showFull?: boolean;
}

export default function LoginButton({ isMobile, showFull }: LoginButtonProps) {
  const { data: session, status } = useSession();
  const [showAdCode, setShowAdCode] = useState(false);
  const [adCode, setAdCode] = useState('');
  const [adsOff, setAdsOff] = useState(areAdsDisabled());

  const handleAdCode = useCallback(() => {
    if (adCode.trim().toLowerCase() === 'nawap') {
      disableAds('Nawap');
      setAdsOff(true);
      setShowAdCode(false);
      setAdCode('');
    }
  }, [adCode]);

  const handleRemoveAdCode = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vibe_ads_disabled');
    }
    setAdsOff(false);
    setShowAdCode(false);
  }, []);

  if (status === 'loading') {
    return (
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors"
        style={{ color: 'var(--text-muted)' }}
        disabled
      >
        <div className="w-4 h-4 rounded-full animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
        {showFull && <span>Loading...</span>}
      </button>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-1.5">
        {session.user.image && (
          <img
            src={session.user.image}
            alt=""
            className="w-6 h-6 rounded-full cursor-pointer"
            referrerPolicy="no-referrer"
            onClick={() => setShowAdCode(!showAdCode)}
            title={adsOff ? 'Ads disabled - click to manage' : 'Click to open settings'}
          />
        )}
        {!isMobile && (
          <span className="text-[10px] max-w-[80px] truncate" style={{ color: 'var(--text-secondary)' }}>
            {session.user.name?.split(' ')[0] || 'User'}
          </span>
        )}
        {adsOff && (
          <span title="Ads disabled">
            <EyeOff size={10} style={{ color: 'var(--accent-green)' }} />
          </span>
        )}
        <button
          onClick={() => signOut()}
          className="p-1.5 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Sign out"
        >
          <LogOut size={isMobile ? 16 : 12} />
        </button>

        {showAdCode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAdCode(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative w-72 mx-4 p-4 rounded-xl shadow-2xl border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Developer Settings</div>
              <input
                type="text"
                value={adCode}
                onChange={(e) => setAdCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdCode()}
                placeholder="Enter access code..."
                className="w-full border rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                autoFocus
              />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleAdCode(); }}
                  className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold"
                  style={{ background: 'var(--accent-blue)', color: 'white', touchAction: 'manipulation' }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowAdCode(false); }}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', touchAction: 'manipulation' }}
                >
                  Cancel
                </button>
              </div>
              {adsOff ? (
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent-green)' }}>
                    <EyeOff size={10} />
                    <span>Ads are disabled</span>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveAdCode(); }}
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{ background: 'rgba(220,53,69,0.15)', color: '#dc3545', touchAction: 'manipulation' }}
                  >
                    Remove Code
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                  Enter code to disable ads
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isMobile && !showFull) {
    return (
      <button
        onClick={() => signIn('google')}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
        style={{ color: 'var(--accent-blue)', background: 'rgba(0,122,204,0.15)', border: '1px solid rgba(0,122,204,0.3)' }}
      >
        <LogIn size={14} />
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
      style={{ color: 'var(--accent-blue)', background: 'rgba(0,122,204,0.1)' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.1)'}
    >
      <LogIn size={isMobile ? 14 : 11} />
      <span>Sign In</span>
    </button>
  );
}
