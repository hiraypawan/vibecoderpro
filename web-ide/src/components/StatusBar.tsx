'use client';

import { MessageSquare, Eye, EyeOff, Terminal, Download, Radio, FolderOpen } from 'lucide-react';

interface StatusBarProps {
  fileCount: number;
  activeFile: string | null;
  isStreaming: boolean;
  showChat: boolean;
  onToggleChat: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  showTerminal: boolean;
  onToggleTerminal: () => void;
  onOpenDownload: () => void;
  onOpenProjects: () => void;
  currentProjectId: string | null;
}

export default function StatusBar({ fileCount, activeFile, isStreaming, showChat, onToggleChat, showPreview, onTogglePreview, showTerminal, onToggleTerminal, onOpenDownload, onOpenProjects, currentProjectId }: StatusBarProps) {
  const ext = activeFile ? activeFile.split('.').pop()?.toLowerCase() || '' : '';
  const langMap: Record<string, string> = {
    js: 'JavaScript', ts: 'TypeScript', jsx: 'React JSX', tsx: 'React TSX',
    html: 'HTML', css: 'CSS', json: 'JSON', md: 'Markdown', py: 'Python',
  };

  return (
    <div className="h-6 flex items-center px-2 text-[11px] shrink-0 select-none border-t" style={{ background: 'var(--bg-statusbar)', color: 'var(--text-white)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Radio size={9} className={isStreaming ? 'animate-pulse' : 'opacity-50'} />
          <span>{isStreaming ? 'AI Active' : 'Ready'}</span>
        </div>
        <div className="w-px h-3 opacity-30" />
        <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
        {currentProjectId && (
          <>
            <div className="w-px h-3 opacity-30" />
            <button onClick={onOpenProjects} className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            ><FolderOpen size={9} /><span>Project</span></button>
          </>
        )}
      </div>
      <div className="flex-1 text-center opacity-70">
        {activeFile && <span>{activeFile}</span>}
      </div>
      <div className="flex items-center gap-1">
        {activeFile && ext && (
          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,255,255,0.15)' }}>{langMap[ext] || ext.toUpperCase()}</span>
        )}
        <div className="w-px h-3 opacity-30 mx-1" />
        <button onClick={onToggleChat} className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors" style={{ background: showChat ? 'rgba(255,255,255,0.2)' : 'transparent' }}
          onMouseEnter={(e) => { if (!showChat) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { if (!showChat) e.currentTarget.style.background = 'transparent'; }}
        ><MessageSquare size={9} /><span>Chat</span></button>
        <button onClick={onTogglePreview} className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors" style={{ background: showPreview ? 'rgba(255,255,255,0.2)' : 'transparent' }}
          onMouseEnter={(e) => { if (!showPreview) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { if (!showPreview) e.currentTarget.style.background = 'transparent'; }}
        >{showPreview ? <EyeOff size={9} /> : <Eye size={9} />}<span>Preview</span></button>
        <button onClick={onToggleTerminal} className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors" style={{ background: showTerminal ? 'rgba(255,255,255,0.2)' : 'transparent' }}
          onMouseEnter={(e) => { if (!showTerminal) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { if (!showTerminal) e.currentTarget.style.background = 'transparent'; }}
        ><Terminal size={9} /><span>Terminal</span></button>
        {fileCount > 0 && (
          <button onClick={onOpenDownload} className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Download size={9} /><span>ZIP</span></button>
        )}
      </div>
    </div>
  );
}
