'use client';

import { useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Save, Copy } from 'lucide-react';

interface CodeEditorProps {
  filePath: string | null;
  content: string;
  onSave: (path: string, content: string) => void;
}

const LANG_MAP: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java', go: 'go',
  rs: 'rust', rb: 'ruby', html: 'html', css: 'css', json: 'json',
  md: 'markdown', yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql',
  sh: 'shell', bash: 'shell', xml: 'xml', c: 'c', cpp: 'cpp',
  cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin', dart: 'dart',
  vue: 'html', svelte: 'html', txt: 'plaintext',
};

function getLanguage(fp: string): string { return LANG_MAP[fp.split('.').pop()?.toLowerCase() || ''] || 'plaintext'; }

export default function CodeEditor({ filePath, content, onSave }: CodeEditorProps) {
  const editorRef = useRef<any>(null);

  const handleMount = useCallback((editor: any) => {
    editorRef.current = editor;
    editor.addCommand(2048 | 49, () => { if (filePath) onSave(filePath, editor.getValue()); });
  }, [filePath, onSave]);

  if (!filePath) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-editor)' }}>
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-5">{'</>'}</div>
          <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>No file open</div>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Select a file from the Explorer or ask the AI to create one</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full" style={{ background: 'var(--bg-editor)' }}>
      <div className="flex items-center justify-between px-3 py-1 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{filePath}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => { if (content) navigator.clipboard.writeText(content); }} className="p-1.5 rounded transition-colors"
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Copy size={11} style={{ color: 'var(--text-muted)' }} /></button>
          <button onClick={() => { if (filePath && editorRef.current) onSave(filePath, editorRef.current.getValue()); }} className="p-1.5 rounded transition-colors"
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Save size={11} style={{ color: 'var(--accent-green)' }} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          key={filePath}
          language={getLanguage(filePath)}
          value={content}
          theme="vs-dark"
          options={{
            minimap: { enabled: true, maxColumn: 80, renderCharacters: false },
            fontSize: 13, fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace", fontLigatures: true,
            lineNumbers: 'on', glyphMargin: false, folding: true, foldingStrategy: 'indentation',
            scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on',
            renderWhitespace: 'selection', bracketPairColorization: { enabled: true },
            smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on',
            padding: { top: 8, bottom: 8 }, lineHeight: 20,
            suggest: { showMethods: true, showFunctions: true, showConstructors: true },
            quickSuggestions: true, formatOnPaste: true, formatOnType: true,
          }}
          onMount={handleMount}
          onChange={(v) => { if (filePath && v !== undefined) onSave(filePath, v); }}
        />
      </div>
    </div>
  );
}
