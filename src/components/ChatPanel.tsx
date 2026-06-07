'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Copy, Bot, User, Check, Lightbulb, Hammer, Bug, Code, FileText, Play, Braces, Sparkles } from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; }
interface ChatPanelProps {
  messages: Message[];
  onSend: (message: string) => void;
  isStreaming: boolean;
  activeTasks: string[];
  completedTasks: string[];
  onAiAction?: (action: string) => void;
  selectedCode?: string;
  promptLimit?: { remaining: number; isLimited: boolean; isSignedIn: boolean };
  onSignIn?: () => void;
}

const AI_ACTIONS = [
  { id: 'explain', label: 'Explain', icon: Lightbulb, color: 'var(--accent-yellow)' },
  { id: 'refactor', label: 'Refactor', icon: Hammer, color: 'var(--accent-blue)' },
  { id: 'debug', label: 'Debug', icon: Bug, color: 'var(--accent-red)' },
  { id: 'test', label: 'Tests', icon: Code, color: 'var(--accent-green)' },
  { id: 'document', label: 'Document', icon: FileText, color: 'var(--accent-purple)' },
  { id: 'optimize', label: 'Optimize', icon: Play, color: 'var(--accent-cyan)' },
  { id: 'convert', label: 'TS', icon: Braces, color: 'var(--accent-pink)' },
];

const QUICK_PROMPTS = [
  'Build a landing page with hero, features, pricing, and footer',
  'Create a todo app with add, delete, and mark complete',
  'Make a calculator with a modern dark UI',
  'Build a weather dashboard with charts',
  'Create a portfolio site with animations',
  'Make a chat UI with message bubbles',
];

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```|<write[\s\S]*?<\/write>|<edit[\s\S]*?<\/edit>|<run[^>]*\/>)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const nl = inner.indexOf('\n');
      const lang = nl > -1 ? inner.substring(0, nl).trim() : '';
      const code = nl > -1 ? inner.substring(nl + 1) : inner;
      return (
        <pre key={i} className="rounded p-2 my-1 overflow-x-auto border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}>
          {lang && <span className="text-[8px] uppercase block mb-1" style={{ color: 'var(--text-muted)' }}>{lang}</span>}
          <code className="text-[11px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{code}</code>
        </pre>
      );
    }
    if (part.startsWith('<write') || part.startsWith('<edit')) {
      const fileMatch = part.match(/file=["']([^"']+)["']/);
      const fileName = fileMatch ? fileMatch[1] : 'unknown';
      const isWrite = part.startsWith('<write');
      return (
        <div key={i} className="my-1 rounded border overflow-hidden" style={{ borderColor: 'rgba(0,122,204,0.3)', background: 'rgba(0,122,204,0.05)' }}>
          <div className="flex items-center gap-2 px-2 py-1 border-b" style={{ background: 'rgba(0,122,204,0.1)', borderColor: 'rgba(0,122,204,0.2)' }}>
            <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--accent-blue)' }}>{isWrite ? 'Create File' : 'Edit File'}</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-primary)' }}>{fileName}</span>
          </div>
          <pre className="p-2 text-[10px] max-h-16 overflow-hidden font-mono" style={{ color: 'var(--text-muted)' }}>{part.substring(0, 150)}...</pre>
        </div>
      );
    }
    if (part.startsWith('<run')) {
      const cmdMatch = part.match(/cmd=["']([^"']+)["']/);
      const cmd = cmdMatch ? cmdMatch[1] : '...';
      return (
        <div key={i} className="my-1 rounded border px-2 py-1 flex items-center gap-2" style={{ borderColor: 'rgba(78,201,176,0.3)', background: 'rgba(78,201,176,0.05)' }}>
          <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--accent-green)' }}>Terminal</span>
          <code className="text-[10px] font-mono" style={{ color: 'var(--accent-green)' }}>$ {cmd}</code>
        </div>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ChatPanel({ messages, onSend, isStreaming, activeTasks, completedTasks, onAiAction, selectedCode, promptLimit, onSignIn }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isStreaming]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput('');
    setShowQuickPrompts(false);
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  const handleCopy = useCallback(async (content: string, idx: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-panel)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-sidebar)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>AI Assistant</span>
        </div>
        {promptLimit && !promptLimit.isSignedIn && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
              background: promptLimit.isLimited ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
              color: promptLimit.isLimited ? 'var(--accent-red)' : 'var(--accent-green)',
            }}>
              {promptLimit.isLimited ? 'Limit reached' : `${promptLimit.remaining} left`}
            </span>
          </div>
        )}
        {promptLimit?.isSignedIn && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(63,185,80,0.15)', color: 'var(--accent-green)' }}>
            Unlimited
          </span>
        )}
      </div>

      {/* Sign-up prompt when limited */}
      {promptLimit?.isLimited && !promptLimit.isSignedIn && (
        <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--border-primary)', background: 'rgba(0,122,204,0.05)' }}>
          <div className="text-center">
            <div className="text-[12px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Free limit reached
            </div>
            <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
              Sign in with Google for unlimited AI prompts. Free to use — we rely on ads to cover API costs.
            </div>
            <button
              onClick={onSignIn}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{ background: 'var(--accent-blue)', color: 'white' }}
            >
              Sign in with Google
            </button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="px-3 py-1 border-b flex items-center gap-2 shrink-0" style={{ background: 'rgba(0,122,204,0.05)', borderColor: 'rgba(0,122,204,0.2)' }}>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent-blue)' }} />
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent-blue)', animationDelay: '0.2s' }} />
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent-blue)', animationDelay: '0.4s' }} />
          </div>
          <span className="text-[9px]" style={{ color: 'var(--accent-blue)' }}>AI is thinking...</span>
        </div>
      )}

      {/* AI Action Bar - only show after first message */}
      {onAiAction && messages.length > 0 && (
        <div className="px-2 py-1 border-b flex items-center gap-1 overflow-x-auto shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
          <Sparkles size={10} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onAiAction(action.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors shrink-0"
              style={{ color: action.color, background: 'var(--bg-tertiary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              title={`AI: ${action.label}`}
            >
              <action.icon size={9} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <div className="text-4xl mb-3 opacity-10">{'</>'}</div>
              <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Start a conversation</div>
              <div className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Ask me to build something for you</div>
              <button
                onClick={() => setShowQuickPrompts(!showQuickPrompts)}
                className="text-[11px] px-3 py-1.5 rounded-md border transition-colors"
                style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {showQuickPrompts ? 'Hide prompts' : 'Get started'}
              </button>
              {showQuickPrompts && (
                <div className="mt-3 space-y-1.5">
                  {QUICK_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => { onSend(prompt); setShowQuickPrompts(false); }}
                      className="block w-full text-left px-3 py-2 rounded border text-[11px] transition-colors"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', background: 'var(--bg-tertiary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="group">
            <div className="flex gap-2">
              <div className="mt-0.5 shrink-0">
                {msg.role === 'user' ? (
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(197,134,192,0.15)' }}><User size={11} style={{ color: 'var(--accent-purple)' }} /></div>
                ) : (
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'rgba(0,122,204,0.15)' }}><Bot size={11} style={{ color: 'var(--accent-blue)' }} /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {msg.role === 'user' ? 'You' : 'Architect'}
                  </span>
                  {msg.role === 'assistant' && (
                    <button onClick={() => handleCopy(msg.content, i)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {copiedIdx === i ? <Check size={10} style={{ color: 'var(--accent-green)' }} /> : <Copy size={10} style={{ color: 'var(--text-muted)' }} />}
                    </button>
                  )}
                </div>
                <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>
                  {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to build something..."
            rows={1}
            className="flex-1 border rounded-md px-3 py-2 text-[12px] resize-none focus:outline-none transition-colors"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", minHeight: '36px', maxHeight: '120px' }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-primary)'}
            onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 120)}px`; }}
          />
          <button onClick={handleSubmit} disabled={!input.trim() || isStreaming}
            className="px-3 py-2 rounded-md text-white transition-colors self-end disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent-blue)' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#005a9e'; }}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent-blue)'}
          ><Send size={14} /></button>
        </div>
      </div>
    </div>
  );
}
