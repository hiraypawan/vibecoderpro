'use client';

import { useState } from 'react';
import { X, Copy, Check, Twitter, MessageSquare, Link2, Download } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle?: string;
  projectUrl?: string;
}

export default function ShareModal({ isOpen, onClose, projectTitle = 'My Project', projectUrl }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = projectUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = `Check out "${projectTitle}" — built with Vibe Coder Pro, a free AI-powered IDE`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const shareOnReddit = () => {
    window.open(
      `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Share Project</span>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><X size={14} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 border rounded-lg px-3 py-2 text-[12px] font-mono"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: copied ? 'var(--accent-green)' : 'var(--accent-blue)', color: 'white' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={shareOnTwitter}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: '#1DA1F2', color: 'white' }}
            >
              <Twitter size={14} /> Twitter
            </button>
            <button
              onClick={shareOnReddit}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: '#FF4500', color: 'white' }}
            >
              <MessageSquare size={14} /> Reddit
            </button>
          </div>

          <button
            onClick={() => { navigator.share?.({ title: projectTitle, text: shareText, url: shareUrl }).catch(() => {}); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium border transition-colors"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Link2 size={14} /> More sharing options
          </button>
        </div>
      </div>
    </div>
  );
}
