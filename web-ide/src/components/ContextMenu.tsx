'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: any;
  action: () => void;
  separator?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 30);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-md shadow-xl border py-1 min-w-[180px]"
      style={{ left: adjustedX, top: adjustedY, background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t" style={{ borderColor: 'var(--border-primary)' }} />;
        }
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
            className="w-full flex items-center gap-2 px-3 py-1 text-[12px] transition-colors text-left"
            style={{
              color: item.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--bg-active)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            disabled={item.disabled}
          >
            {Icon && <Icon size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
