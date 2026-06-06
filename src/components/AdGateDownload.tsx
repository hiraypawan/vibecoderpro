'use client';

import { useState, useCallback, useEffect } from 'react';
import { Download, ExternalLink, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { triggerAd, fetchTelemetryDestination } from '@/lib/ads';
import { getLocalProject } from '@/lib/localDb';

interface AdGateDownloadProps {
  projectName: string;
  projectId: string;
  files?: Map<string, string>;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
}

export default function AdGateDownload({
  projectName,
  projectId,
  files: filesProp,
  onDownloadStart,
  onDownloadComplete,
}: AdGateDownloadProps) {
  const [adWatched, setAdWatched] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState(true);

  // Load files from IndexedDB if not provided
  useEffect(() => {
    const loadFiles = async () => {
      if (filesProp && filesProp.size > 0) {
        // Convert Map to Record
        const filesObj: Record<string, string> = {};
        filesProp.forEach((content, path) => { filesObj[path] = content; });
        setFiles(filesObj);
      } else if (projectId) {
        // Load from IndexedDB
        const localProject = await getLocalProject(projectId);
        if (localProject?.files) {
          setFiles(localProject.files);
        }
      }
      setLoadingFiles(false);
    };
    loadFiles();
  }, [filesProp, projectId]);

  const handleWatchAd = useCallback(async () => {
    setAdLoading(true);
    try {
      const destination = await fetchTelemetryDestination();
      if (destination) {
        window.open(destination, '_blank', 'noopener,noreferrer');
      }
      // Mark ad as watched after short delay
      setTimeout(() => {
        setAdWatched(true);
        setAdLoading(false);
      }, 2000);
    } catch {
      setAdWatched(true);
      setAdLoading(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!adWatched || Object.keys(files).length === 0) return;
    setDownloading(true);
    onDownloadStart?.();

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      Object.entries(files).forEach(([path, content]) => {
        zip.file(path, content);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'project'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onDownloadComplete?.();
    } catch (err) {
      console.error('Download failed:', err);
    }

    setDownloading(false);
  }, [adWatched, files, projectName, onDownloadStart, onDownloadComplete]);

  const fileCount = Object.keys(files).length;
  const hasFiles = fileCount > 0;

  return (
    <div className="border rounded-lg p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Download size={14} style={{ color: 'var(--accent-blue)' }} />
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Download Project
        </span>
      </div>

      <p className="text-[10px] mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        Watch a short ad to download your project as a ZIP file. This helps keep Vibe Coder Pro free.
      </p>

      {!hasFiles && !loadingFiles ? (
        <div className="flex items-center gap-2 p-2 rounded" style={{ background: 'rgba(210,153,34,0.1)' }}>
          <AlertTriangle size={12} style={{ color: '#d29922' }} />
          <span className="text-[10px]" style={{ color: '#d29922' }}>
            No files to download. Create some code first!
          </span>
        </div>
      ) : !adWatched ? (
        <button
          onClick={handleWatchAd}
          disabled={adLoading || loadingFiles}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            background: 'rgba(0,122,204,0.15)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(0,122,204,0.3)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.25)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.15)'}
        >
          {adLoading ? (
            <>
              <Clock size={12} className="animate-spin" /> Loading ad...
            </>
          ) : loadingFiles ? (
            <>
              <Clock size={12} className="animate-spin" /> Loading files...
            </>
          ) : (
            <>
              <ExternalLink size={12} /> Watch Ad to Unlock Download
            </>
          )}
        </button>
      ) : (
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            background: 'var(--accent-green)',
            color: 'white',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          {downloading ? (
            <>
              <Clock size={12} className="animate-spin" /> Creating ZIP...
            </>
          ) : (
            <>
              <CheckCircle size={12} /> Download {projectName || 'Project'}.zip
            </>
          )}
        </button>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Clock size={9} style={{ color: '#d29922' }} />
          <span className="text-[9px]" style={{ color: '#d29922' }}>
            Projects auto-delete after 24 hours
          </span>
        </div>
        {hasFiles && (
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
