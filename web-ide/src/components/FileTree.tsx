'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FileCode, FileType, FileJson, FileText, Trash2 } from 'lucide-react';

export interface FileNode { name: string; path: string; type: 'file' | 'folder'; children?: FileNode[]; }

interface FileTreeProps { nodes: FileNode[]; onFileOpen: (path: string) => void; activeFile: string | null; onContextMenu?: (e: React.MouseEvent, file?: string) => void; }

const FILE_ICONS: Record<string, typeof File> = {
  html: FileCode, css: FileType, js: FileCode, ts: FileCode, jsx: FileCode, tsx: FileCode,
  json: FileJson, md: FileText, py: FileCode, rb: FileCode, go: FileCode,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || File;
}

function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const c: Record<string, string> = { html: '#e44d26', css: '#264de4', js: '#f0db4f', ts: '#3178c6', jsx: '#61dafb', json: '#f0db4f', md: '#519aba', py: '#3572A5' };
  return c[ext] || 'var(--text-muted)';
}

function TreeNode({ node, depth, onFileOpen, activeFile, onContextMenu }: { node: FileNode; depth: number; onFileOpen: (p: string) => void; activeFile: string | null; onContextMenu?: (e: React.MouseEvent, file?: string) => void; }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isFolder = node.type === 'folder';
  const isActive = activeFile === node.path;
  const Icon = isFolder ? (expanded ? FolderOpen : Folder) : getFileIcon(node.name);

  return (
    <div>
      <div
        onClick={() => isFolder ? setExpanded((p) => !p) : onFileOpen(node.path)}
        onContextMenu={(e) => { e.stopPropagation(); onContextMenu?.(e, node.path); }}
        className="flex items-center gap-1.5 py-[3px] px-2 cursor-pointer transition-colors group"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          background: isActive ? 'var(--bg-active)' : 'transparent',
          color: isActive ? 'var(--text-white)' : 'var(--text-primary)',
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = isActive ? 'var(--bg-active)' : 'transparent'; }}
      >
        {isFolder ? (
          expanded ? <ChevronDown size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        ) : <span className="w-2.5" />}
        <Icon size={13} style={{ color: isFolder ? '#dcb67a' : getFileColor(node.name), flexShrink: 0 }} />
        <span className="text-[11px] truncate flex-1">{node.name}</span>
        {!isFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); onContextMenu?.(e, node.path); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244,71,71,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 size={9} />
          </button>
        )}
      </div>
      {isFolder && expanded && node.children && node.children.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} onFileOpen={onFileOpen} activeFile={activeFile} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}

export default function FileTree({ nodes, onFileOpen, activeFile, onContextMenu }: FileTreeProps) {
  return (
    <div className="h-full overflow-y-auto py-1">
      {nodes.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
          No files yet. Ask the AI to create something.
        </div>
      ) : nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} onFileOpen={onFileOpen} activeFile={activeFile} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}
