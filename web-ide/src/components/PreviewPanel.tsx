'use client';

import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, ExternalLink, Maximize2, Minimize2, AlertTriangle, X } from 'lucide-react';

interface PreviewPanelProps { files: Map<string, string>; onClose?: () => void; version?: number; }

export default function PreviewPanel({ files, onClose, version }: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLastUpdate] = useState(Date.now());

  const buildHtml = useCallback(() => {
    const htmlFile = files.get('index.html');
    if (!htmlFile) return `<!DOCTYPE html><html><head><style>body{display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#6a6a6a;font-family:monospace;font-size:13px;flex-direction:column;gap:8px}</style></head><body><div style="font-size:48px;opacity:.15">&lt;/&gt;</div><div>No index.html to preview</div></body></html>`;

    const cssFile = files.get('styles.css') || files.get('style.css');
    const jsFile = files.get('script.js') || files.get('main.js');
    let html = htmlFile;

    if (cssFile) {
      if (html.includes('href="styles.css"') || html.includes('href="style.css"')) {
        html = html.replace(/<link[^>]*href=["'](styles|style)\.css["'][^>]*>/i, `<style>${cssFile}</style>`);
      } else if (!html.includes('<style>')) {
        html = html.replace('</head>', `<style>${cssFile}</style></head>`);
      }
    }
    if (jsFile) {
      if (html.includes('src="script.js"') || html.includes('src="main.js"')) {
        html = html.replace(/<script[^>]*src=["'](script|main)\.js["'][^>]*><\/script>/i, `<script>${jsFile}<\/script>`);
      } else if (!html.includes('<script>')) {
        html = html.replace('</body>', `<script>${jsFile}<\/script></body>`);
      }
    }
    return html;
  }, [files]);

  const html = useMemo(() => buildHtml(), [buildHtml, files.size, version]);

  useEffect(() => {
    if (iframeRef.current) { try { iframeRef.current.srcdoc = html; setError(null); } catch (e: any) { setError(e.message); } }
  }, [html]);

  return (
    <div className={`h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`} style={{ background: '#ffffff' }}>
      <div className="flex items-center px-2 py-1 border-b gap-1.5 shrink-0" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <div className="flex-1 mx-2 px-2 py-0.5 rounded text-[10px] font-mono truncate" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>localhost:preview</div>
        <button onClick={() => setLastUpdate(Date.now())} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Refresh"
        ><RefreshCw size={10} /></button>
        <button onClick={() => { const b = new Blob([html], { type: 'text/html' }); window.open(URL.createObjectURL(b), '_blank'); }}
          className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Open in new tab"
        ><ExternalLink size={10} /></button>
        <button onClick={() => setIsFullscreen((f) => !f)} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Toggle fullscreen"
        >{isFullscreen ? <Minimize2 size={10} /> : <Maximize2 size={10} />}</button>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="Close preview"
          ><X size={10} /></button>
        )}
      </div>
      {error && (
        <div className="px-2 py-1 border-b flex items-center gap-1" style={{ background: 'rgba(244,71,71,0.1)', borderColor: 'rgba(244,71,71,0.3)' }}>
          <AlertTriangle size={10} style={{ color: 'var(--accent-red)' }} />
          <span className="text-[10px]" style={{ color: 'var(--accent-red)' }}>{error}</span>
        </div>
      )}
      <iframe ref={iframeRef} srcDoc={html} className="flex-1 border-0 w-full" title="Preview" sandbox="allow-scripts allow-same-origin allow-modals allow-forms" />
    </div>
  );
}
