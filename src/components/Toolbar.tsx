'use client';

import { CheckSquare, Square, Cpu, Activity, Download, Eye, EyeOff, Terminal } from 'lucide-react';

interface ToolbarProps {
  activeTasks: string[];
  completedTasks: string[];
  fileCount: number;
  onDownloadAll: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  showTerminal: boolean;
  onToggleTerminal: () => void;
}

export default function Toolbar({ activeTasks, completedTasks, fileCount, onDownloadAll, showPreview, onTogglePreview, showTerminal, onToggleTerminal }: ToolbarProps) {
  return (
    <div className="h-8 bg-ide-sidebar border-b border-ide-border flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-1.5">
        <Cpu size={12} className="text-ide-accent" />
        <span className="text-[11px] font-bold text-ide-accent tracking-wide">VIBE</span>
        <span className="text-[10px] text-ide-border">v3.0</span>
      </div>

      <div className="h-3 w-px bg-ide-border" />

      <div className="flex items-center gap-3 text-[10px] text-ide-text">
        <div className="flex items-center gap-1">
          <Activity size={10} className="text-ide-green" />
          <span>Files: {fileCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-ide-purple">Tasks:</span>
          <span className="text-ide-green">{completedTasks.length} done</span>
          <span className="text-ide-border">/</span>
          <span className="text-ide-yellow">{activeTasks.length} active</span>
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onToggleTerminal}
        className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded ${showTerminal ? 'text-ide-accent bg-ide-accent/10' : 'text-ide-border hover:text-ide-text hover:bg-ide-border/30'}`}
      >
        <Terminal size={10} />
        <span>Terminal</span>
      </button>

      {fileCount > 0 && (
        <>
          <button
            onClick={onTogglePreview}
            className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded ${showPreview ? 'text-ide-accent bg-ide-accent/10' : 'text-ide-border hover:text-ide-text hover:bg-ide-border/30'}`}
          >
            {showPreview ? <EyeOff size={10} /> : <Eye size={10} />}
            <span>Preview</span>
          </button>
          <button
            onClick={onDownloadAll}
            className="flex items-center gap-1 text-[10px] text-ide-border hover:text-ide-text transition-colors px-2 py-1 rounded hover:bg-ide-border/30"
          >
            <Download size={10} />
            <span>ZIP</span>
          </button>
        </>
      )}
    </div>
  );
}
