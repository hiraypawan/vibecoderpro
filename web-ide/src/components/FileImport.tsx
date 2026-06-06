'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileCode, X, AlertTriangle, ExternalLink, Clock, CheckCircle, FolderOpen } from 'lucide-react';
import { fetchTelemetryDestination, areAdsDisabled } from '@/lib/ads';

interface FileImportProps {
  onImport: (files: Record<string, string>) => void;
  onClose: () => void;
}

export default function FileImport({ onImport, onClose }: FileImportProps) {
  const [adWatched, setAdWatched] = useState(areAdsDisabled());
  const [adLoading, setAdLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importMode, setImportMode] = useState<'files' | 'folder'>('files');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleWatchAd = useCallback(async () => {
    setAdLoading(true);
    try {
      const destination = await fetchTelemetryDestination();
      if (destination) {
        window.open(destination, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => {
        setAdWatched(true);
        setAdLoading(false);
      }, 2000);
    } catch {
      setAdWatched(true);
      setAdLoading(false);
    }
  }, []);

  const processFiles = useCallback(async (fileList: FileList, isFolder: boolean = false) => {
    if (!adWatched) return;
    setImporting(true);

    const files: Record<string, string> = {};
    const maxSize = 5 * 1024 * 1024; // 5MB per file
    let totalSize = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > maxSize) continue;
      if (totalSize + file.size > 50 * 1024 * 1024) break; // 50MB total

      try {
        const content = await file.text();
        // Use webkitRelativePath for folder uploads, otherwise just filename
        const path = isFolder && (file as any).webkitRelativePath 
          ? (file as any).webkitRelativePath 
          : file.name;
        files[path] = content;
        totalSize += file.size;
      } catch {
        // Skip binary files
      }
    }

    if (Object.keys(files).length > 0) {
      onImport(files);
      onClose();
    }

    setImporting(false);
  }, [adWatched, onImport, onClose]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      // Check if dropped items include folders
      const hasFolders = Array.from(e.dataTransfer.files).some(
        (f: any) => f.webkitRelativePath?.includes('/') || f.type === ''
      );
      processFiles(e.dataTransfer.files, hasFolders);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files, importMode === 'folder');
    }
  }, [processFiles, importMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md mx-4 rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <Upload size={16} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Import Project</span>
          </div>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><X size={14} /></button>
        </div>

        <div className="p-4">
          {/* Warning */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg" style={{ background: 'rgba(210,153,34,0.1)', border: '1px solid rgba(210,153,34,0.2)' }}>
            <AlertTriangle size={14} style={{ color: '#d29922', marginTop: 1, flexShrink: 0 }} />
            <div className="text-[11px]" style={{ color: '#d29922' }}>
              <strong>Imported projects auto-delete after 24 hours.</strong> Always download your source code. Storage is limited to 50MB per user.
            </div>
          </div>

          {/* Ad Gate */}
          {!adWatched ? (
            <div className="text-center py-4">
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Watch a short ad to unlock file import. This helps keep Vibe Coder Pro free.
              </p>
              <button
                onClick={handleWatchAd}
                disabled={adLoading}
                className="flex items-center justify-center gap-2 mx-auto px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
                style={{ background: 'rgba(0,122,204,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(0,122,204,0.3)' }}
              >
                {adLoading ? <><Clock size={12} className="animate-spin" /> Loading ad...</> : <><ExternalLink size={12} /> Watch Ad to Import</>}
              </button>
            </div>
          ) : (
            <>
              {/* Import Mode Toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setImportMode('files')}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: importMode === 'files' ? 'rgba(0,122,204,0.15)' : 'var(--bg-tertiary)',
                    color: importMode === 'files' ? 'var(--accent-blue)' : 'var(--text-muted)',
                    border: `1px solid ${importMode === 'files' ? 'rgba(0,122,204,0.3)' : 'var(--border-primary)'}`
                  }}
                >
                  <FileCode size={12} /> Files
                </button>
                <button
                  onClick={() => setImportMode('folder')}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: importMode === 'folder' ? 'rgba(0,122,204,0.15)' : 'var(--bg-tertiary)',
                    color: importMode === 'folder' ? 'var(--accent-blue)' : 'var(--text-muted)',
                    border: `1px solid ${importMode === 'folder' ? 'rgba(0,122,204,0.3)' : 'var(--border-primary)'}`
                  }}
                >
                  <FolderOpen size={12} /> Folder
                </button>
              </div>

              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-[var(--accent-blue)]' : ''
                }`}
                style={{
                  borderColor: dragOver ? 'var(--accent-blue)' : 'var(--border-primary)',
                  background: dragOver ? 'rgba(0,122,204,0.05)' : 'var(--bg-tertiary)',
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => {
                  if (importMode === 'folder') {
                    folderInputRef.current?.click();
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                {importMode === 'folder' ? (
                  <FolderOpen size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <FileCode size={32} className="mx-auto mb-2 opacity-30" style={{ color: 'var(--text-muted)' }} />
                )}
                <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  {importing ? 'Importing...' : importMode === 'folder' ? 'Click to select a folder' : 'Drop files here or click to browse'}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {importMode === 'folder' 
                    ? 'Imports entire folder with subfolders preserved'
                    : 'Supports HTML, CSS, JS, JSON, and text files (max 5MB each)'}
                </div>
              </div>

              {/* Hidden inputs */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".html,.css,.js,.json,.ts,.jsx,.tsx,.md,.txt,.py,.java,.cpp,.c,.rb,.go,.rs"
                className="hidden"
                onChange={handleFileSelect}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore - webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processFiles(e.target.files, true);
                  }
                }}
              />

              {/* Supported formats */}
              <div className="mt-3 flex flex-wrap gap-1">
                {['HTML', 'CSS', 'JS', 'JSON', 'TS', 'MD', 'PY'].map((ext) => (
                  <span key={ext} className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    .{ext.toLowerCase()}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
