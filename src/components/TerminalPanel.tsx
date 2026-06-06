'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Terminal as TerminalIcon, Trash2, ChevronDown, ChevronRight, Plus } from 'lucide-react';

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'warn' | 'system';
  message: string;
  timestamp: number;
}

interface TerminalPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  files: Map<string, string>;
  onFileCreate: (path: string, content: string) => void;
  onFileDelete: (path: string) => void;
}

export interface TerminalHandle {
  executeCommand: (cmd: string) => void;
}

const TerminalPanel = forwardRef<TerminalHandle, TerminalPanelProps>(function TerminalPanel({ logs, onClear, files, onFileCreate, onFileDelete }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [currentInput, setCurrentInput] = useState('');
  const [outputLines, setOutputLines] = useState<Array<{ type: 'cmd' | 'output' | 'error'; text: string }>>([
    { type: 'output', text: 'Vibe Terminal v3.0 — Type "help" for commands' },
  ]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [outputLines, logs, isExpanded]);

  const addOutput = useCallback((type: 'cmd' | 'output' | 'error', text: string) => {
    setOutputLines((prev) => [...prev, { type, text }]);
  }, []);

  const executeCommand = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    addOutput('cmd', `$ ${trimmed}`);
    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);
    setCurrentInput('');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        addOutput('output', [
          'Available commands:',
          '  ls [path]           List files',
          '  cat <file>          Show file contents',
          '  echo "text" > file  Write text to file',
          '  touch <file>        Create empty file',
          '  rm <file>           Delete file',
          '  pwd                 Print working directory',
          '  clear               Clear terminal',
          '  history             Show command history',
          '  mkdir <dir>         Create directory (virtual)',
          '  whoami              Show current user',
          '  date                Show current date',
          '  tree                Show file tree',
          '  npm install <pkg>   Simulate npm install',
          '  npx <cmd>           Simulate npx command',
        ].join('\n'));
        break;

      case 'ls': {
        const targetDir = args[0] || '';
        const fileList = Array.from(files.keys())
          .filter((f) => targetDir ? f.startsWith(targetDir) : !f.includes('/'))
          .sort();
        if (fileList.length === 0) {
          addOutput('output', targetDir ? `ls: cannot access '${targetDir}': No such file or directory` : '(empty)');
        } else {
          const formatted = fileList.map((f) => {
            const name = f.split('/').pop() || f;
            const ext = name.split('.').pop()?.toLowerCase() || '';
            const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json'].includes(ext);
            return isCode ? `\x1b[32m${name}\x1b[0m` : name;
          }).join('  ');
          addOutput('output', formatted);
        }
        break;
      }

      case 'cat': {
        if (!args[0]) { addOutput('error', 'Usage: cat <filename>'); break; }
        const content = files.get(args[0]);
        if (content !== undefined) {
          addOutput('output', content);
        } else {
          addOutput('error', `cat: ${args[0]}: No such file`);
        }
        break;
      }

      case 'echo': {
        const full = args.join(' ');
        const redirectMatch = full.match(/^(.+?)\s*>\s*(.+)$/);
        if (redirectMatch) {
          const text = redirectMatch[1].replace(/^["']|["']$/g, '');
          const file = redirectMatch[2].trim();
          onFileCreate(file, text);
          addOutput('output', `Written to ${file}`);
        } else {
          addOutput('output', full.replace(/^["']|["']$/g, ''));
        }
        break;
      }

      case 'touch': {
        if (!args[0]) { addOutput('error', 'Usage: touch <filename>'); break; }
        if (!files.has(args[0])) {
          onFileCreate(args[0], '');
          addOutput('output', `Created ${args[0]}`);
        } else {
          addOutput('output', `${args[0]} already exists`);
        }
        break;
      }

      case 'rm': {
        if (args.length === 0) { addOutput('error', 'Usage: rm <file1> [file2] ...'); break; }
        for (const file of args) {
          if (file === '-f') continue;
          if (files.has(file)) {
            onFileDelete(file);
            addOutput('output', `Removed ${file}`);
          } else {
            addOutput('error', `rm: ${file}: No such file`);
          }
        }
        break;
      }

      case 'pwd':
        addOutput('output', '/workspace');
        break;

      case 'clear':
        setOutputLines([]);
        break;

      case 'history':
        commandHistory.forEach((h, i) => addOutput('output', `  ${i + 1}  ${h}`));
        break;

      case 'mkdir':
        addOutput('output', args[0] ? `Directory "${args[0]}" created (virtual)` : 'Usage: mkdir <dirname>');
        break;

      case 'whoami':
        addOutput('output', 'vibe-user');
        break;

      case 'date':
        addOutput('output', new Date().toString());
        break;

      case 'tree': {
        const tree = Array.from(files.keys()).sort().map((f) => {
          const parts = f.split('/');
          const indent = '  '.repeat(parts.length - 1);
          const name = parts.pop() || f;
          return `${indent}├── ${name}`;
        }).join('\n');
        addOutput('output', tree || '(empty)');
        break;
      }

      case 'npm':
      case 'npx':
        addOutput('output', `[simulated] ${trimmed}\nNote: Run this in your local terminal for real execution.`);
        break;

      case 'git':
        addOutput('output', `[simulated] ${trimmed}\nNote: Git operations require a real terminal.`);
        break;

      default:
        addOutput('error', `command not found: ${cmd}. Type "help" for available commands.`);
    }
  }, [files, onFileCreate, onFileDelete, addOutput, commandHistory]);

  useImperativeHandle(ref, () => ({ executeCommand }), [executeCommand]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(currentInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIdx = historyIdx < commandHistory.length - 1 ? historyIdx + 1 : historyIdx;
        setHistoryIdx(newIdx);
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIdx] || '');
      } else {
        setHistoryIdx(-1);
        setCurrentInput('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setOutputLines([]);
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      addOutput('cmd', `$ ${currentInput}^C`);
      setCurrentInput('');
    }
  }, [currentInput, commandHistory, historyIdx, executeCommand, addOutput]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-panel)' }}>
      {/* Header */}
      <div className="flex items-center px-3 py-1 border-b" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
        <button onClick={() => setIsExpanded((p) => !p)} className="flex items-center gap-1.5 hover:text-white transition-colors" style={{ color: 'var(--text-secondary)' }}>
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <TerminalIcon size={11} style={{ color: 'var(--accent-blue)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider ml-0.5" style={{ color: 'var(--accent-blue)' }}>Terminal</span>
        </button>
        <div className="flex-1" />
        <button onClick={onClear} className="p-1 rounded hover:bg-white/5 transition-colors" title="Clear terminal">
          <Trash2 size={10} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Terminal body */}
      {isExpanded && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-5 cursor-text" onClick={focusInput} style={{ fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace" }}>
          {/* Output lines */}
          {outputLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line.type === 'cmd' ? (
                <span style={{ color: 'var(--accent-green)' }}>{line.text}</span>
              ) : line.type === 'error' ? (
                <span style={{ color: 'var(--accent-red)' }}>{line.text}</span>
              ) : (
                <span style={{ color: 'var(--text-primary)' }}>{line.text}</span>
              )}
            </div>
          ))}

          {/* AI logs */}
          {logs.slice(-5).map((log, i) => (
            <div key={`log-${i}`} className="whitespace-pre-wrap break-all opacity-60">
              <span style={{ color: 'var(--text-muted)' }}>[{formatTime(log.timestamp)}] </span>
              <span style={{ color: log.type === 'error' ? 'var(--accent-red)' : log.type === 'success' ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
                {log.message}
              </span>
            </div>
          ))}

          {/* Input line */}
          <div className="flex items-center">
            <span style={{ color: 'var(--accent-green)' }} className="mr-1 select-none">$</span>
            <input
              ref={inputRef}
              value={currentInput}
              onChange={(e) => { setCurrentInput(e.target.value); setHistoryIdx(-1); }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent outline-none font-mono text-[12px] caret-white"
              style={{ color: 'var(--text-bright)', fontFamily: "'JetBrains Mono', monospace" }}
              placeholder=""
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </div>
  );
});

export default TerminalPanel;
