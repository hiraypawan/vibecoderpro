'use client';

import { X, File, FileCode, FileText, FileJson, FileType } from 'lucide-react';

interface TabBarProps {
  openFiles: string[];
  activeFile: string | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  files: Map<string, string>;
}

const FILE_ICONS: Record<string, typeof File> = {
  html: FileCode, htm: FileCode, css: FileType, js: FileCode, mjs: FileCode,
  ts: FileCode, jsx: FileCode, tsx: FileCode, json: FileJson, md: FileText, txt: FileText,
};

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || File;
}

function getFileColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const colors: Record<string, string> = {
    html: '#e44d26', css: '#264de4', js: '#f0db4f', ts: '#3178c6',
    jsx: '#61dafb', tsx: '#61dafb', json: '#f0db4f', md: '#519aba',
  };
  return colors[ext] || 'var(--text-muted)';
}

export default function TabBar({ openFiles, activeFile, onTabClick, onTabClose, files }: TabBarProps) {
  return (
    <div className="flex overflow-x-auto shrink-0 border-b" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
      {openFiles.map((path) => {
        const Icon = getFileIcon(path);
        const color = getFileColor(path);
        const isActive = path === activeFile;
        const filename = path.split('/').pop() || path;

        return (
          <div
            key={path}
            onClick={() => onTabClick(path)}
            className="flex items-center gap-1.5 pl-3 pr-1 py-1.5 text-[11px] cursor-pointer border-r min-w-0 max-w-48 group transition-colors select-none"
            style={{
              background: isActive ? 'var(--bg-tab-active)' : 'var(--bg-tab-inactive)',
              color: isActive ? 'var(--text-white)' : 'var(--text-muted)',
              borderColor: 'var(--border-primary)',
              borderTop: isActive ? '1px solid var(--accent-blue)' : '1px solid transparent',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tab-inactive)'; }}
          >
            <Icon size={12} style={{ color, flexShrink: 0 }} />
            <span className="truncate font-mono">{filename}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(path); }}
              className="ml-1 p-0.5 rounded transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244,71,71,0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
