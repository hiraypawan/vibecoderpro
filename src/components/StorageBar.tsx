'use client';

import { useState, useEffect } from 'react';
import { HardDrive, AlertTriangle, Cloud, FolderOpen } from 'lucide-react';

interface StorageBarProps {
  refreshTrigger?: number;
  compact?: boolean;
}

export default function StorageBar({ refreshTrigger, compact }: StorageBarProps) {
  const [storage, setStorage] = useState({
    totalUsed: 0,
    totalFileStorage: 0,
    totalChatStorage: 0,
    maxStorage: 50 * 1024 * 1024,
    projectCount: 0,
    percentage: 0,
  });

  useEffect(() => {
    const fetchStorage = async () => {
      try {
        const res = await fetch('/api/storage');
        const data = await res.json();
        setStorage(data);
      } catch {}
    };
    fetchStorage();
  }, [refreshTrigger]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const isNearLimit = storage.percentage > 80;
  const isAtLimit = storage.percentage > 95;

  if (compact) {
    return (
      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <HardDrive size={12} style={{ color: isAtLimit ? 'var(--accent-red)' : 'var(--accent-blue)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Storage</span>
          </div>
          <span className="text-[11px] font-medium" style={{ color: isAtLimit ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
            {formatSize(storage.totalUsed)} / 50 MB
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, storage.percentage)}%`,
              background: isAtLimit ? 'var(--accent-red)' : isNearLimit ? '#d29922' : 'var(--accent-blue)',
            }}
          />
        </div>

        {/* Breakdown */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: 'var(--accent-blue)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Files: {formatSize(storage.totalFileStorage)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: 'var(--accent-green)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Chat: {formatSize(storage.totalChatStorage)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <FolderOpen size={10} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {storage.projectCount} project{storage.projectCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Warning */}
        {isNearLimit && (
          <div className="mt-2 p-2 rounded-lg flex items-center gap-2" style={{ 
            background: isAtLimit ? 'rgba(248,81,73,0.1)' : 'rgba(210,153,34,0.1)',
            border: `1px solid ${isAtLimit ? 'rgba(248,81,73,0.3)' : 'rgba(210,153,34,0.3)'}` 
          }}>
            <AlertTriangle size={12} style={{ color: isAtLimit ? 'var(--accent-red)' : '#d29922' }} />
            <span className="text-[10px]" style={{ color: isAtLimit ? 'var(--accent-red)' : '#d29922' }}>
              {isAtLimit ? 'Storage full! Delete old projects or upgrade.' : 'Running low on storage. Consider downloading old projects.'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full version
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,122,204,0.15)' }}>
            <Cloud size={16} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Cloud Storage</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>50 MB included with free plan</div>
          </div>
        </div>
        <span className="text-[14px] font-bold" style={{ color: isAtLimit ? 'var(--accent-red)' : 'var(--text-primary)' }}>
          {formatSize(storage.totalUsed)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 rounded-full overflow-hidden mb-3" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, storage.percentage)}%`,
            background: isAtLimit 
              ? 'linear-gradient(90deg, var(--accent-red), #f97583)' 
              : isNearLimit 
                ? 'linear-gradient(90deg, #d29922, #e3b341)' 
                : 'linear-gradient(90deg, var(--accent-blue), #79c0ff)',
          }}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Files</div>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{formatSize(storage.totalFileStorage)}</div>
        </div>
        <div className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Chat</div>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{formatSize(storage.totalChatStorage)}</div>
        </div>
        <div className="p-2 rounded-lg text-center" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>Projects</div>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{storage.projectCount}</div>
        </div>
      </div>

      {/* Warning */}
      {isNearLimit && (
        <div className="p-2 rounded-lg flex items-center gap-2" style={{ 
          background: isAtLimit ? 'rgba(248,81,73,0.1)' : 'rgba(210,153,34,0.1)',
          border: `1px solid ${isAtLimit ? 'rgba(248,81,73,0.3)' : 'rgba(210,153,34,0.3)'}` 
        }}>
          <AlertTriangle size={14} style={{ color: isAtLimit ? 'var(--accent-red)' : '#d29922' }} />
          <div>
            <div className="text-[11px] font-medium" style={{ color: isAtLimit ? 'var(--accent-red)' : '#d29922' }}>
              {isAtLimit ? 'Storage Full' : 'Running Low'}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {isAtLimit 
                ? 'Delete old projects or upgrade to Pro for more space.' 
                : 'Download old projects before they expire to free up space.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
