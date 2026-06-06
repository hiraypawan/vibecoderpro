'use client';

import { Files, Search, GitBranch, Puzzle, FolderOpen } from 'lucide-react';

interface ActivityBarProps {
  activePanel: 'explorer' | 'search' | 'git' | 'extensions' | 'projects';
  onPanelChange: (panel: 'explorer' | 'search' | 'git' | 'extensions' | 'projects') => void;
}

const panels = [
  { id: 'explorer' as const, icon: Files, label: 'Explorer' },
  { id: 'search' as const, icon: Search, label: 'Search' },
  { id: 'git' as const, icon: GitBranch, label: 'Source Control' },
  { id: 'projects' as const, icon: FolderOpen, label: 'Projects' },
  { id: 'extensions' as const, icon: Puzzle, label: 'Extensions' },
];

export default function ActivityBar({ activePanel, onPanelChange }: ActivityBarProps) {
  return (
    <div className="w-12 flex flex-col items-center py-1 shrink-0 border-r" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
      <div className="flex flex-col gap-0.5 w-full">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onPanelChange(id)}
            className="w-full flex items-center justify-center py-2.5 transition-all relative"
            style={{
              color: activePanel === id ? 'var(--text-white)' : 'var(--text-muted)',
              background: activePanel === id ? 'var(--bg-active)' : 'transparent',
            }}
            onMouseEnter={(e) => { if (activePanel !== id) e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { if (activePanel !== id) e.currentTarget.style.color = 'var(--text-muted)'; }}
            title={label}
          >
            <Icon size={20} strokeWidth={1.5} />
            {activePanel === id && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: 'var(--accent-blue)' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
