'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, FileCode, Terminal, Eye, EyeOff, MessageSquare, Download, Settings, Layout, PanelLeftClose, PanelLeft } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  category: string;
  icon: any;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        filtered[selectedIdx].action();
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, selectedIdx, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-lg shadow-2xl border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
              No commands found
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <div
                  key={cmd.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
                  style={{
                    background: i === selectedIdx ? 'var(--bg-active)' : 'transparent',
                    color: i === selectedIdx ? 'var(--text-white)' : 'var(--text-primary)',
                  }}
                  onClick={() => { cmd.action(); onClose(); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <Icon size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <span className="flex-1 text-[12px] truncate">{cmd.label}</span>
                  <span className="text-[10px] px-1 rounded" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>{cmd.category}</span>
                  {cmd.shortcut && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{cmd.shortcut}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
