'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { signIn } from 'next-auth/react';
import ChatPanel from './ChatPanel';
import CodeEditor from './CodeEditor';
import FileTree from './FileTree';
import PreviewPanel from './PreviewPanel';
import TerminalPanel, { TerminalHandle } from './TerminalPanel';
import StatusBar from './StatusBar';
import ActivityBar from './ActivityBar';
import TabBar from './TabBar';
import CommandPalette from './CommandPalette';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import LoginButton from './LoginButton';
import ShareModal from './ShareModal';
import ProjectManager from './ProjectManager';
import AdGateDownload from './AdGateDownload';
import FileImport from './FileImport';
import AgentLoader from './AgentLoader';
import StorageBar from './StorageBar';
import { ChatMessage } from '@/lib/api';
import { generateFileTree, FileNode } from '@/lib/filetree';
import { parseToolBlocks, ToolBlock } from '@/lib/parser';
import { triggerAd, checkAdFreePass, disableAds, areAdsDisabled } from '@/lib/ads';
import { usePromptLimit } from '@/lib/usePromptLimit';
import { useAchievements, AchievementPopup } from './Achievements';
import { saveLocalProject, getLocalProject, getAllLocalProjects } from '@/lib/localDb';
import { runMultiAgentPipeline } from '@/lib/aiPipeline';
import MobileAdBanner from './MobileAdBanner';
import InlineAd from './InlineAd';
import {
  X, MessageSquare, Eye, Terminal, Download, Settings, Layout,
  PanelLeftClose, PanelLeft, Search, FileCode, Bot, Copy, Trash2,
  ChevronDown, ChevronRight, FolderPlus, FilePlus, RefreshCw,
  Maximize2, Minimize2, ExternalLink, Hammer, Bug, Lightbulb,
  Code, Play, Braces, FileText, Save, Undo, Redo, Scissors,
  Share2, Github, Globe, Upload, LogIn
} from 'lucide-react';

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'warn' | 'system';
  message: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `You are an expert full-stack engineer. Output code using EXACTLY this format — NO markdown, NO code fences:

<write file="index.html">
<!DOCTYPE html>
<html lang="en">
...full file content...
</html>
</write>

<write file="styles.css">
...full file content...
</write>

<write file="script.js">
...full file content>
</write>

RULES:
1. Output ONLY <write> tags. NO \`\`\`html, NO \`\`\`css, NO \`\`\`js, NO markdown headers like ###. Just raw <write> tags.
2. Every file must be COMPLETE. For a landing page: 300+ lines HTML, 200+ lines CSS, 80+ lines JS.
3. NEVER write "Lorem ipsum" — use REAL descriptive text about the product/service.
4. NEVER write "Feature 1", "Feature 2" — use REAL feature names with REAL descriptions.
5. For a landing page you MUST include: navigation bar, hero with headline+subtitle+CTA, 3-6 feature cards with icons, 3 pricing tiers with real prices and feature lists, footer with links and copyright.
6. Every HTML tag must be properly closed. Every CSS brace must be balanced. Every JS function must have a body.
7. Use dark theme colors (#0a0a0a background, white text, #0070f3 accent). Modern, professional design.
8. Use CSS variables for colors. Responsive design with media queries.
9. NO external dependencies — vanilla HTML/CSS/JS only.
10. NO placeholders like "// add more styles" or "/* continue */" — write ALL the code.`;

export default function Workspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const filesRef = useRef<Map<string, string>>(new Map());
  const [renderCount, setRenderCount] = useState(0);
  const forceRender = useCallback((fn: (n: number) => number) => setRenderCount(fn), []);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const { remaining, isLimited, isSignedIn, trackPrompt } = usePromptLimit();
  const { achievements, currentPopup: achievementPopup, stats: achievementStats, trackPrompt: trackAchievementPrompt, trackFileCreated, trackProjectSaved, trackSignedIn, dismissPopup: dismissAchievement } = useAchievements();
  const [showChat, setShowChat] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activePanel, setActivePanel] = useState<'explorer' | 'search' | 'git' | 'extensions' | 'projects'>('explorer');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'editor' | 'preview' | 'terminal' | 'projects'>('chat');
  const [selectedCode, setSelectedCode] = useState('');
  const [chatWidth, setChatWidth] = useState(350);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [previewWidth, setPreviewWidth] = useState(50);
  const [showShareModal, setShowShareModal] = useState(false);
  const [adFreePass, setAdFreePass] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTask, setAiTask] = useState('');
  const [storageRefresh, setStorageRefresh] = useState(0);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const terminalDragging = useRef(false);
  const terminalStartY = useRef(0);
  const terminalStartH = useRef(0);
  const previewDragging = useRef(false);
  const previewStartX = useRef(0);
  const previewStartW = useRef(50);

  useEffect(() => {
    checkAdFreePass('local-session').then(setAdFreePass).catch(() => {});
  }, []);

  // Track signed-in achievement
  useEffect(() => {
    if (isSignedIn) trackSignedIn();
  }, [isSignedIn, trackSignedIn]);

  const files = filesRef.current;
  const fileTree = useMemo(() => generateFileTree(files), [files.size]);
  const fileCount = files.size;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev.slice(-200), { type, message, timestamp: Date.now() }]);
  }, []);

  const loadProjectFiles = useCallback((filesObj: Record<string, string>) => {
    filesRef.current.clear();
    Object.entries(filesObj).forEach(([path, content]) => {
      filesRef.current.set(path, content);
    });
    const paths = Object.keys(filesObj);
    setOpenFiles(paths.slice(0, 10));
    if (paths.length > 0) setActiveFile(paths[0]);
    forceRender((n) => n + 1);
    addLog('info', `Loaded project: ${paths.length} files`);
  }, [addLog, forceRender]);

  // Save current files to IndexedDB only (anonymous) or IndexedDB + MongoDB (signed-in)
  const saveFilesToLocal = useCallback(async (projectId: string, projectName: string) => {
    const filesObj: Record<string, string> = {};
    filesRef.current.forEach((content, path) => { filesObj[path] = content; });
    if (Object.keys(filesObj).length > 0) {
      // Always save to IndexedDB (fast, local, device-only)
      await saveLocalProject(projectId, projectName, filesObj);
      // Only sync to MongoDB if signed in (cross-device access)
      if (isSignedIn) {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesObj }),
          });
        } catch {}
      }
    }
  }, [isSignedIn]);

  // Load chat history from project
  const loadChatHistory = useCallback((messages: Array<{role: string; content: string}>) => {
    if (messages.length > 0) {
      setMessages(messages as ChatMessage[]);
      addLog('info', `Loaded ${messages.length} messages from project history`);
    }
  }, [addLog]);

  const handleProjectSaved = useCallback(() => {
    setLastSaved(new Date());
    setStorageRefresh(prev => prev + 1);
    addLog('success', 'Project saved to cloud');
    trackProjectSaved();
  }, [addLog, trackProjectSaved]);

  const applyToolBlocks = useCallback((blocks: ToolBlock[]) => {
    let changed = false;
    const editResults: { path: string; success: boolean; detail: string }[] = [];
    
    for (const block of blocks) {
      if (block.type === 'write') {
        const existed = filesRef.current.has(block.path);
        // Safety: warn if new content is drastically smaller (likely truncated)
        if (existed) {
          const backup = filesRef.current.get(block.path);
          if (backup && backup.length > 200 && block.content.length < backup.length * 0.3) {
            addLog('warn', `Write to ${block.path} is only ${block.content.length} bytes (was ${backup.length}). Possible truncation — applying anyway.`);
          }
        }
        filesRef.current.set(block.path, block.content);
        changed = true;
        addLog('success', `${existed ? 'Updated' : 'Created'} ${block.path} (${block.content.length} bytes)`);
        if (!existed && !openFiles.includes(block.path)) {
          setOpenFiles((prev) => [...prev, block.path]);
          setActiveFile(block.path);
        }
        if (block.path.endsWith('.html') && !showPreview) setShowPreview(true);
        if (!existed) trackFileCreated();
        editResults.push({ path: block.path, success: true, detail: `${existed ? 'updated' : 'created'} (${block.content.length} bytes)` });
      } else if (block.type === 'edit' && block.search && block.replace) {
        const existing = filesRef.current.get(block.path) || '';
        if (existing.length === 0) {
          addLog('error', `Edit failed: ${block.path} not found or empty`);
          editResults.push({ path: block.path, success: false, detail: 'file not found' });
          continue;
        }
        
        // Strategy 1: Exact match
        const idx = existing.indexOf(block.search);
        if (idx !== -1) {
          const newContent = existing.substring(0, idx) + block.replace + existing.substring(idx + block.search.length);
          filesRef.current.set(block.path, newContent);
          changed = true;
          addLog('info', `Edited ${block.path} (exact match)`);
          editResults.push({ path: block.path, success: true, detail: 'exact match' });
          continue;
        }
        
        // Strategy 2: Normalized whitespace match (tabs vs spaces, trailing whitespace)
        const normalize = (s: string) => s.replace(/\t/g, '    ').replace(/[ \t]+$/gm, '').trim();
        const normSearch = normalize(block.search);
        const normExisting = normalize(existing);
        const normIdx = normExisting.indexOf(normSearch);
        if (normIdx !== -1) {
          // Find the actual position in original content by counting chars
          const origLines = existing.split('\n');
          const normLines = normExisting.split('\n');
          let origStart = 0, origEnd = 0;
          let normPos = 0, origPos = 0;
          for (let li = 0; li < origLines.length && normPos <= normIdx; li++) {
            if (normPos === normIdx) origStart = origPos;
            normPos += normLines[li]?.length + 1 || 0;
            origPos += origLines[li].length + 1;
          }
          // Fallback: use the normalized content to reconstruct
          const newNormContent = normExisting.substring(0, normIdx) + normalize(block.replace) + normExisting.substring(normIdx + normSearch.length);
          filesRef.current.set(block.path, newNormContent);
          changed = true;
          addLog('info', `Edited ${block.path} (whitespace-normalized match)`);
          editResults.push({ path: block.path, success: true, detail: 'normalized match' });
          continue;
        }
        
        // Strategy 3: Line-by-line fuzzy match with scoring
        const searchLines = block.search.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const contentLines = existing.split('\n');
        let bestScore = 0;
        let bestIndex = -1;
        
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
          let score = 0;
          let matched = 0;
          for (let j = 0; j < searchLines.length; j++) {
            const cl = contentLines[i + j]?.trim() || '';
            const sl = searchLines[j];
            if (cl === sl) { score += 2; matched++; }
            else if (cl.includes(sl) || sl.includes(cl)) { score += 1; matched++; }
          }
          // Require at least 70% of lines to have some match
          if (matched >= searchLines.length * 0.7 && score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
        
        if (bestIndex !== -1) {
          const replaceLines = block.replace.split('\n');
          contentLines.splice(bestIndex, searchLines.length, ...replaceLines);
          filesRef.current.set(block.path, contentLines.join('\n'));
          changed = true;
          addLog('info', `Edited ${block.path} (fuzzy match, score: ${bestScore}/${searchLines.length * 2})`);
          editResults.push({ path: block.path, success: true, detail: `fuzzy match (score ${bestScore})` });
        } else {
          addLog('error', `Edit failed: no match found in ${block.path} — search block didn't match any code`);
          editResults.push({ path: block.path, success: false, detail: 'no match found' });
        }
      } else if (block.type === 'run' && block.cmd) {
        addLog('system', `Running: ${block.cmd}`);
        terminalRef.current?.executeCommand(block.cmd);
        setShowTerminal(true);
      }
    }
    if (changed) forceRender((n) => n + 1);
    
    // BUG 6 FIX: Self-verification — log results summary for user visibility
    const failures = editResults.filter(r => !r.success);
    if (failures.length > 0) {
      addLog('warn', `${failures.length} edit(s) failed: ${failures.map(f => `${f.path} (${f.detail})`).join(', ')}. Ask me to retry or fix manually.`);
    }
    return editResults;
  }, [addLog, openFiles, showPreview, trackFileCreated, forceRender]);

  const handleSend = useCallback(async (userMessage: string) => {
    // Enforce prompt limit for anonymous users
    if (!isSignedIn) {
      const allowed = await trackPrompt();
      if (!allowed) {
        addLog('warn', 'Free prompt limit reached. Sign in with Google for unlimited.');
        return;
      }
    }

    // Track achievement
    trackAchievementPrompt();

    // Auto-create project on first message if none exists
    if (!currentProjectId && messages.length === 0) {
      try {
        const projectName = userMessage.substring(0, 50).replace(/[^\w\s-]/g, '').trim() || 'New Project';
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        if (isSignedIn) {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: projectName }),
          });
          const data = await res.json();
          if (data.project?._id) {
            setCurrentProjectId(data.project._id);
            addLog('info', `Created project: ${projectName}`);
          }
        } else {
          await saveLocalProject(localId, projectName, {});
          setCurrentProjectId(localId);
          addLog('info', `Created local project: ${projectName}`);
        }
      } catch (err) {
        addLog('warn', 'Could not create project automatically');
      }
    }

    // Set AI loading state with task description
    setAiLoading(true);
    const isCodeRelated = /\b(code|file|edit|create|build|make|html|css|js|script|project|website|app|terminal|run|install|deploy|fix|bug|error|change|update|modify|add|remove)\b/i.test(userMessage);
    if (isCodeRelated) {
      setAiTask('Building your request...');
    } else if (/\b(search|find|research|look up|google)\b/i.test(userMessage)) {
      setAiTask('Researching information...');
    } else if (/\b(explain|what|how|why|tell me)\b/i.test(userMessage)) {
      setAiTask('Analyzing your question...');
    } else {
      setAiTask('Processing your request...');
    }

    // BUG 2 FIX: Build context BEFORE user message, not after
    // BUG 3 FIX: Smart file budget — send full files when total is small, truncate only largest files when total exceeds budget
    const hasFiles = filesRef.current.size > 0;
    const MAX_FILE_CONTEXT_CHARS = 80000; // ~20K tokens budget for file context
    
    // Build compacted conversation history (BUG 4 FIX)
    const MAX_HISTORY_CHARS = 40000; // ~10K tokens for history
    const compactedHistory: ChatMessage[] = [];
    let historyChars = 0;
    // Walk backwards through messages, keeping recent ones full, compacting old ones
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgChars = msg.content.length;
      if (historyChars + msgChars > MAX_HISTORY_CHARS) {
        // Remaining messages get truncated to just first 200 chars
        compactedHistory.unshift({
          role: msg.role,
          content: msg.content.substring(0, 200) + '\n...[earlier context truncated]',
        });
      } else {
        compactedHistory.unshift(msg);
        historyChars += msgChars;
      }
    }

    // Build file context with smart budgeting
    let fileContextMsg: ChatMessage | null = null;
    if (hasFiles) {
      const entries = Array.from(filesRef.current.entries());
      const totalSize = entries.reduce((sum, [, c]) => sum + c.length, 0);
      
      let fileContext: string;
      if (totalSize <= MAX_FILE_CONTEXT_CHARS) {
        // Small project — send everything in full
        fileContext = entries
          .map(([name, content]) => `=== ${name} (${content.length} bytes) ===\n${content}`)
          .join('\n\n');
      } else {
        // Large project — send full content for small files, truncate only the largest
        const perFileBudget = Math.floor(MAX_FILE_CONTEXT_CHARS / entries.length);
        fileContext = entries
          .map(([name, content]) => {
            if (content.length <= perFileBudget) {
              return `=== ${name} (${content.length} bytes) ===\n${content}`;
            }
            return `=== ${name} (${content.length} bytes, showing first ${perFileBudget}) ===\n${content.substring(0, perFileBudget)}\n... [truncated — ${content.length - perFileBudget} bytes omitted]`;
          })
          .join('\n\n');
      }
      
      const fileList = entries.map(([name]) => name).join(', ');
      fileContextMsg = {
        role: 'system' as const,
        content: `Current workspace files: [${fileList}]\n\n${fileContext}`,
      };
    }

    setMessages([...messages, { role: 'user', content: userMessage }]);
    setIsStreaming(true);
    addLog('system', `User: ${userMessage.substring(0, 100)} | Context: ${compactedHistory.length} msgs, ${hasFiles ? filesRef.current.size + ' files' : 'no files'}`);

    try {
      // Multi-agent pipeline: plan → code → quality check → auto-retry
      const pipelineResult = await runMultiAgentPipeline({
        systemPrompt: SYSTEM_PROMPT,
        fileContext: fileContextMsg,
        history: compactedHistory,
        userMessage,
        existingFiles: new Set(filesRef.current.keys()),
        onStreamUpdate: (content, phaseMsg) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') { last.content = content; }
            else { updated.push({ role: 'assistant', content }); }
            return updated;
          });
          setAiTask(phaseMsg);
        },
        onPhaseChange: (phase) => {
          const labels: Record<string, string> = {
            planning: 'Planning architecture...',
            coding: 'Generating code...',
            reviewing: 'Verifying quality...',
            fixing: 'Auto-fixing issues...',
            done: 'Finalizing...',
          };
          setAiTask(labels[phase] || phase);
          addLog('system', `Phase: ${phase}`);
        },
      });

      // Show final content
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') { last.content = pipelineResult.content; }
        else { updated.push({ role: 'assistant', content: pipelineResult.content }); }
        return updated;
      });

      // Log pipeline stats
      if (pipelineResult.plan) addLog('info', 'Plan generated for complex request');
      if (pipelineResult.retryCount > 0) addLog('warn', `Auto-retried ${pipelineResult.retryCount}x to fix quality`);
      if (pipelineResult.qualityIssues.length > 0) addLog('warn', `${pipelineResult.qualityIssues.length} quality issue(s) remain after retry`);

      const finalBlocks = parseToolBlocks(pipelineResult.content, new Set(filesRef.current.keys()));
      addLog('system', `Parser found ${finalBlocks.length} block(s): ${finalBlocks.map((b) => `${b.type}:${b.path || b.cmd || '?'}`).join(', ') || 'none'}`);
      if (finalBlocks.length > 0) {
        applyToolBlocks(finalBlocks);
        // Auto-save files to IndexedDB after AI creates/edits
        if (currentProjectId) {
          try {
            const projRes = await fetch(`/api/projects/${currentProjectId}`);
            const projData = await projRes.json();
            const projectName = projData.project?.name || 'project';
            saveFilesToLocal(currentProjectId, projectName);
          } catch {
            saveFilesToLocal(currentProjectId, 'project');
          }
        }
      }
      addLog('success', `AI response complete${pipelineResult.retryCount > 0 ? ` (${pipelineResult.retryCount} auto-fix applied)` : ''}`);
    } catch (error: any) {
      addLog('error', `Error: ${error.message}`);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally { 
      setIsStreaming(false);
      setAiLoading(false);
      setAiTask('');
      
      // Auto-save chat history to project (only if signed in)
      if (currentProjectId && isSignedIn) {
        try {
          const chatToSave = messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role,
            content: m.content,
          }));
          await fetch(`/api/projects/${currentProjectId}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatToSave }),
          });
        } catch {}
      }
    }
  }, [messages, applyToolBlocks, addLog, isSignedIn, trackPrompt, trackAchievementPrompt, currentProjectId, saveFilesToLocal]);

  const handleAiAction = useCallback((action: string) => {
    const code = selectedCode || (activeFile ? filesRef.current.get(activeFile)?.substring(0, 2000) : '') || '';
    const prompts: Record<string, string> = {
      explain: `Explain this code in detail:\n\`\`\`\n${code}\n\`\`\``,
      refactor: `Refactor this code to be cleaner and more efficient:\n\`\`\`\n${code}\n\`\`\``,
      debug: `Find and fix bugs in this code:\n\`\`\`\n${code}\n\`\`\``,
      test: `Write unit tests for this code:\n\`\`\`\n${code}\n\`\`\``,
      document: `Add documentation comments to this code:\n\`\`\`\n${code}\n\`\`\``,
      optimize: `Optimize this code for performance:\n\`\`\`\n${code}\n\`\`\``,
      convert: `Convert this code to TypeScript:\n\`\`\`\n${code}\n\`\`\``,
    };
    if (prompts[action]) {
      handleSend(prompts[action]);
      if (isMobile) setMobileTab('chat');
    }
  }, [selectedCode, activeFile, handleSend, isMobile]);

  const handleFileOpen = useCallback((path: string) => {
    setActiveFile(path);
    setOpenFiles((prev) => prev.includes(path) ? prev : [...prev, path]);
    if (isMobile) setMobileTab('editor');
  }, [isMobile]);

  const handleFileClose = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== path);
      if (activeFile === path) {
        const idx = prev.indexOf(path);
        setActiveFile(next.length > 0 ? next[Math.min(idx, next.length - 1)] : null);
      }
      return next;
    });
  }, [activeFile]);

  const handleFileSave = useCallback((path: string, content: string) => {
    filesRef.current.set(path, content);
    addLog('info', `Saved ${path}`);
    forceRender((n) => n + 1);
  }, [addLog]);

  const handleTerminalFileCreate = useCallback((path: string, content: string) => {
    filesRef.current.set(path, content);
    forceRender((n) => n + 1);
  }, []);

  const handleTerminalFileDelete = useCallback((path: string) => {
    filesRef.current.delete(path);
    setOpenFiles((prev) => prev.filter((f) => f !== path));
    if (activeFile === path) setActiveFile(null);
    forceRender((n) => n + 1);
  }, [activeFile]);

  const handleFileDelete = useCallback((path: string) => {
    filesRef.current.delete(path);
    setOpenFiles((prev) => prev.filter((f) => f !== path));
    if (activeFile === path) setActiveFile(null);
    addLog('info', `Deleted ${path}`);
    forceRender((n) => n + 1);
  }, [activeFile, addLog]);

  const handleFileRename = useCallback((oldPath: string) => {
    const newName = prompt('Rename to:', oldPath);
    if (newName && newName !== oldPath) {
      const content = filesRef.current.get(oldPath);
      if (content !== undefined) {
        filesRef.current.delete(oldPath);
        filesRef.current.set(newName, content);
        setOpenFiles((prev) => prev.map((f) => f === oldPath ? newName : f));
        if (activeFile === oldPath) setActiveFile(newName);
        addLog('info', `Renamed ${oldPath} → ${newName}`);
        forceRender((n) => n + 1);
      }
    }
  }, [activeFile, addLog]);

  const handleDownloadAll = useCallback(async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    filesRef.current.forEach((content, path) => zip.file(path, content));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'project.zip'; a.click();
    URL.revokeObjectURL(url);
    addLog('success', `Downloaded project.zip (${filesRef.current.size} files)`);
  }, [addLog]);

  const handleCopyAll = useCallback(async () => {
    const all = Array.from(filesRef.current.entries())
      .map(([name, content]) => `=== ${name} ===\n${content}`).join('\n\n');
    await navigator.clipboard.writeText(all);
    addLog('info', 'Copied all files to clipboard');
  }, [addLog]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file?: string) => {
    e.preventDefault();
    const items: ContextMenuItem[] = file ? [
      { label: 'Open', icon: FileCode, action: () => handleFileOpen(file) },
      { label: 'Rename', icon: Settings, action: () => handleFileRename(file), shortcut: 'F2' },
      { label: 'Delete', icon: Trash2, action: () => handleFileDelete(file), shortcut: 'Del' },
      { separator: true, label: '', action: () => {} },
      { label: 'Copy Path', icon: Copy, action: () => navigator.clipboard.writeText(file) },
      { label: 'Copy Content', icon: Copy, action: () => { const c = filesRef.current.get(file); if (c) navigator.clipboard.writeText(c); } },
    ] : [
      { label: 'New File', icon: FilePlus, action: () => { const n = prompt('File name:'); if (n) { filesRef.current.set(n, ''); forceRender((x) => x + 1); handleFileOpen(n); } }, shortcut: 'Ctrl+N' },
      { label: 'New Folder', icon: FolderPlus, action: () => { const n = prompt('Folder name:'); if (n) { filesRef.current.set(n + '/.gitkeep', ''); forceRender((x) => x + 1); } } },
      { separator: true, label: '', action: () => {} },
      { label: 'Download All', icon: Download, action: handleDownloadAll, shortcut: 'Ctrl+Shift+S' },
      { label: 'Copy All', icon: Copy, action: handleCopyAll },
      { separator: true, label: '', action: () => {} },
      { label: 'Command Palette', icon: Search, action: () => setShowCommandPalette(true), shortcut: 'Ctrl+K' },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [handleFileOpen, handleFileRename, handleFileDelete, handleDownloadAll, handleCopyAll, forceRender]);

  // Terminal resize drag handlers
  const handleTerminalDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    terminalDragging.current = true;
    terminalStartY.current = e.clientY;
    terminalStartH.current = terminalHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!terminalDragging.current) return;
      const delta = terminalStartY.current - ev.clientY;
      const newH = Math.max(80, Math.min(600, terminalStartH.current + delta));
      setTerminalHeight(newH);
    };
    const onUp = () => {
      terminalDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [terminalHeight]);

  // Preview resize drag handlers
  const handlePreviewDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    previewDragging.current = true;
    const container = (e.target as HTMLElement).closest('[data-editor-container]');
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    previewStartX.current = e.clientX;
    previewStartW.current = previewWidth;

    const onMove = (ev: MouseEvent) => {
      if (!previewDragging.current) return;
      const delta = previewStartX.current - ev.clientX;
      const deltaPercent = (delta / containerWidth) * 100;
      const newW = Math.max(20, Math.min(80, previewStartW.current + deltaPercent));
      setPreviewWidth(newW);
    };
    const onUp = () => {
      previewDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [previewWidth]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setShowCommandPalette(true); }
      if (e.ctrlKey && e.key === 'b') { e.preventDefault(); setShowSidebar((p) => !p); }
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); setShowTerminal((p) => !p); }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); setShowCommandPalette(true); }
      if (e.key === 'F11') { e.preventDefault(); document.documentElement.requestFullscreen?.(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (activeFile) { const c = filesRef.current.get(activeFile); if (c) handleFileSave(activeFile, c); } }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFile, handleFileSave]);

  const commands = useMemo(() => [
    { id: 'toggle-chat', label: 'Toggle AI Chat', category: 'View', icon: MessageSquare, action: () => setShowChat((p) => !p), shortcut: 'Ctrl+\\' },
    { id: 'toggle-preview', label: 'Toggle Preview', category: 'View', icon: Eye, action: () => setShowPreview((p) => !p) },
    { id: 'toggle-terminal', label: 'Toggle Terminal', category: 'View', icon: Terminal, action: () => setShowTerminal((p) => !p), shortcut: 'Ctrl+`' },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', category: 'View', icon: PanelLeft, action: () => setShowSidebar((p) => !p), shortcut: 'Ctrl+B' },
    { id: 'download', label: 'Download Project ZIP', category: 'File', icon: Download, action: handleDownloadAll, shortcut: 'Ctrl+Shift+S' },
    { id: 'new-file', label: 'New File', category: 'File', icon: FilePlus, action: () => { const n = prompt('File name:'); if (n) { filesRef.current.set(n, ''); forceRender((x) => x + 1); handleFileOpen(n); } }, shortcut: 'Ctrl+N' },
    { id: 'explain', label: 'AI: Explain Code', category: 'AI', icon: Lightbulb, action: () => handleAiAction('explain') },
    { id: 'refactor', label: 'AI: Refactor Code', category: 'AI', icon: Hammer, action: () => handleAiAction('refactor') },
    { id: 'debug', label: 'AI: Debug Code', category: 'AI', icon: Bug, action: () => handleAiAction('debug') },
    { id: 'test', label: 'AI: Write Tests', category: 'AI', icon: Code, action: () => handleAiAction('test') },
    { id: 'document', label: 'AI: Add Documentation', category: 'AI', icon: FileText, action: () => handleAiAction('document') },
    { id: 'optimize', label: 'AI: Optimize Code', category: 'AI', icon: Play, action: () => handleAiAction('optimize') },
    { id: 'convert', label: 'AI: Convert to TypeScript', category: 'AI', icon: Braces, action: () => handleAiAction('convert') },
    { id: 'fullscreen', label: 'Toggle Fullscreen', category: 'View', icon: Maximize2, action: () => document.documentElement.requestFullscreen?.(), shortcut: 'F11' },
    { id: 'copy-all', label: 'Copy All Files', category: 'File', icon: Copy, action: handleCopyAll },
  ], [handleDownloadAll, handleFileOpen, handleAiAction, handleCopyAll, forceRender]);

  if (isMobile) {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {/* Mobile Header with safe area for notch */}
        <div className="flex items-center px-3 shrink-0 border-b mobile-header" style={{ 
          background: 'var(--bg-menubar)', 
          borderColor: 'var(--border-primary)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          minHeight: '44px',
          position: 'relative',
          zIndex: 10,
        }}>
          <span className="font-bold tracking-wide text-[13px]" style={{ color: 'var(--accent-blue)' }}>VIBE</span>
          <div className="flex-1 text-center">
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {mobileTab === 'chat' ? 'AI Assistant' : mobileTab === 'editor' ? (activeFile || 'Editor') : mobileTab === 'preview' ? 'Preview' : 'Terminal'}
            </span>
          </div>
          {mobileTab === 'editor' && activeFile && (
            <button onClick={() => { const c = filesRef.current.get(activeFile); if (c) handleFileSave(activeFile, c); }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ color: 'var(--accent-green)', background: 'rgba(78,201,176,0.1)' }}>
              Save
            </button>
          )}
          <LoginButton isMobile />
        </div>

        {/* Active Panel */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobileTab === 'chat' && (
            <div className="flex flex-col h-full">
              <AgentLoader isActive={aiLoading} task={aiTask} />
              <div className="flex-1 min-h-0">
                <ChatPanel messages={messages.filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system')} onSend={handleSend} isStreaming={isStreaming} activeTasks={activeTasks} completedTasks={completedTasks} onAiAction={handleAiAction} selectedCode={selectedCode} promptLimit={{ remaining, isLimited, isSignedIn }} onSignIn={() => signIn('google')} />
              </div>
              {/* Inline ad at bottom of chat (above input) */}
              <InlineAd id="chat-bottom" format="banner" />
            </div>
          )}
          {mobileTab === 'editor' && (
            activeFile ? (
              <div className="flex flex-col h-full">
                <div className="flex-1 min-h-0">
                  <CodeEditor filePath={activeFile} content={files.get(activeFile) || ''} onSave={handleFileSave} />
                </div>
                {/* Inline ad below editor */}
                <InlineAd id="editor-bottom" format="banner" />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center px-6">
                <div>
                  <div className="text-3xl mb-3 opacity-10">{'</>'}</div>
                  <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>No file open</div>
                  <div className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>Ask AI to create something or open a file</div>
                  <button onClick={() => setMobileTab('chat')}
                    className="px-4 py-2 rounded-lg text-[12px] font-medium" style={{ background: 'var(--accent-blue)', color: 'white' }}>
                    Open AI Chat
                  </button>
                </div>
              </div>
            )
          )}
          {mobileTab === 'preview' && (
            <PreviewPanel files={filesRef.current} version={renderCount} />
          )}
          {mobileTab === 'terminal' && (
            <TerminalPanel logs={logs} onClear={() => setLogs([])} files={filesRef.current} onFileCreate={handleTerminalFileCreate} onFileDelete={handleTerminalFileDelete} />
          )}
          {mobileTab === 'projects' && (
            <ProjectManager
              currentProjectId={currentProjectId}
              onSelectProject={setCurrentProjectId}
              onProjectSaved={handleProjectSaved}
              files={filesRef.current}
              onLoadProject={loadProjectFiles}
              onLoadChatHistory={loadChatHistory}
              isMobile
              refreshTrigger={storageRefresh}
              isSignedIn={isSignedIn}
            />
          )}
        </div>

        {/* Bottom floating ad banner - above tab bar */}
        <MobileAdBanner id="mobile-bottom" position="bottom" />

        {/* Bottom Tab Bar */}
        <div className="flex items-center border-t shrink-0 safe-bottom" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)', position: 'relative', zIndex: 10 }}>
          {[
            { id: 'chat' as const, icon: MessageSquare, label: 'AI' },
            { id: 'editor' as const, icon: FileCode, label: 'Code' },
            { id: 'preview' as const, icon: Eye, label: 'Preview' },
            { id: 'terminal' as const, icon: Terminal, label: 'Terminal' },
            { id: 'projects' as const, icon: FolderPlus, label: 'Projects' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setMobileTab(tab.id as any);
                setShowSidebar(false);
              }}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
              style={{
                color: mobileTab === tab.id ? 'var(--accent-blue)' : 'var(--text-muted)',
                background: mobileTab === tab.id ? 'rgba(0,122,204,0.08)' : 'transparent',
              }}
            >
              <tab.icon size={18} strokeWidth={mobileTab === tab.id ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Mobile Quick Actions Bar */}
        <div className="flex items-center justify-around px-2 py-2 border-t" style={{ background: 'var(--bg-menubar)', borderColor: 'var(--border-primary)', position: 'relative', zIndex: 10 }}>
          <button onClick={() => {
              if (!isSignedIn) { setSignInMessage('Sign in to import your project files'); return; }
              // Trigger popunder on import
              try { (window as any).triggerPopunder?.(); } catch {}
              setShowImportModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--accent-purple)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Upload size={14} /> Import</button>
          <button onClick={() => {
              if (!isSignedIn) { setSignInMessage('Sign in to export and download your project'); return; }
              // Trigger popunder and smartlink on export
              try { (window as any).triggerPopunder?.(); } catch {}
              try { (window as any).triggerSmartlink?.(); } catch {}
              setShowDownloadModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--accent-green)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Download size={14} /> Export</button>
          <button onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
            style={{ color: 'var(--accent-blue)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          ><Share2 size={14} /> Share</button>
          <LoginButton isMobile />
        </div>

        {/* Sidebar Overlay */}
        {showSidebar && (
          <>
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowSidebar(false)} />
            <div className="fixed inset-y-0 left-0 w-72 z-50 flex flex-col border-r shadow-2xl" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-secondary)' }}>EXPLORER</span>
                <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                ><X size={14} /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FileTree nodes={fileTree} onFileOpen={(p) => { handleFileOpen(p); setShowSidebar(false); }} activeFile={activeFile} />
              </div>
            </div>
          </>
        )}

        <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />

        {achievementPopup && (
          <AchievementPopup achievement={achievementPopup} onClose={dismissAchievement} />
        )}

        {showImportModal && (
          <FileImport
            onImport={async (files) => {
              Object.entries(files).forEach(([path, content]) => {
                filesRef.current.set(path, content);
              });
              // Save imported files to IndexedDB
              if (currentProjectId) {
                try {
                  const projRes = await fetch(`/api/projects/${currentProjectId}`);
                  const projData = await projRes.json();
                  const projectName = projData.project?.name || 'project';
                  saveFilesToLocal(currentProjectId, projectName);
                } catch {
                  saveFilesToLocal(currentProjectId, 'project');
                }
              }
              forceRender((n) => n + 1);
              addLog('info', `Imported ${Object.keys(files).length} files`);
            }}
            onClose={() => setShowImportModal(false)}
          />
        )}

        {/* Sign-in Required Message */}
        {signInMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSignInMessage(null)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative w-full max-w-sm mx-4 p-5 rounded-xl shadow-2xl border text-center"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'rgba(0,122,204,0.15)' }}>
                <LogIn size={24} style={{ color: 'var(--accent-blue)' }} />
              </div>
              <div className="text-[14px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Sign In Required</div>
              <div className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>{signInMessage}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => signIn('google')}
                  className="flex-1 px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
                  style={{ background: 'var(--accent-blue)', color: 'white' }}
                >
                  Sign In with Google
                </button>
                <button
                  onClick={() => setSignInMessage(null)}
                  className="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showDownloadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowDownloadModal(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <AdGateDownload
                projectName="project"
                projectId={currentProjectId || 'local'}
                files={filesRef.current}
                onDownloadComplete={() => setShowDownloadModal(false)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      {/* Menu Bar with safe area for macOS traffic lights */}
      <div className="flex items-center px-2 text-[11px] shrink-0 select-none border-b" style={{ 
        background: 'var(--bg-menubar)', 
        borderColor: 'var(--border-primary)', 
        color: 'var(--text-secondary)',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 4px)',
        minHeight: '28px'
      }}>
        <span className="font-bold mr-3 tracking-wide text-[12px]" style={{ color: 'var(--accent-blue)' }}>VIBE</span>
        {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Help'].map((item) => (
          <span key={item} className="px-2 py-0.5 rounded transition-colors" style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-white)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >{item}</span>
        ))}
        <div className="flex-1" />
        <LoginButton />
        <span className="mx-1" style={{ color: 'var(--text-muted)' }}>|</span>
        <button onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors"
          style={{ color: 'var(--accent-blue)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="Share Project"
        ><Share2 size={11} /> Share</button>
        <span className="mx-1" style={{ color: 'var(--text-muted)' }}>|</span>
        <span style={{ color: 'var(--text-muted)' }}>Vibe Coder Pro</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <ActivityBar activePanel={activePanel} onPanelChange={setActivePanel} />

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-60 flex flex-col shrink-0 border-r" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)' }}>
            <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {activePanel === 'explorer' ? 'EXPLORER' : activePanel === 'search' ? 'SEARCH' : activePanel === 'git' ? 'SOURCE CONTROL' : activePanel === 'projects' ? 'PROJECTS' : 'EXTENSIONS'}
              </span>
              <button onClick={() => setShowSidebar(false)} className="p-0.5 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              ><PanelLeftClose size={10} /></button>
            </div>
            {activePanel === 'explorer' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="px-2 py-1 border-b flex items-center gap-1" style={{ borderColor: 'var(--border-primary)' }}>
                  <button onClick={() => { const n = prompt('File name:'); if (n) { filesRef.current.set(n, ''); forceRender((x) => x + 1); handleFileOpen(n); } }}
                    className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }} title="New File"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  ><FilePlus size={11} /></button>
                  <button onClick={() => { const n = prompt('Folder name:'); if (n) { filesRef.current.set(n + '/.gitkeep', ''); forceRender((x) => x + 1); } }}
                    className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }} title="New Folder"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  ><FolderPlus size={11} /></button>
                  <div className="flex-1" />
                  <button onClick={() => forceRender((x) => x + 1)} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }} title="Refresh"
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  ><RefreshCw size={11} /></button>
                </div>
                <div className="flex-1 overflow-y-auto" onContextMenu={(e) => handleContextMenu(e)}>
                  <FileTree nodes={fileTree} onFileOpen={handleFileOpen} activeFile={activeFile} onContextMenu={handleContextMenu} />
                </div>
              </div>
            )}
            {activePanel === 'search' && (
              <div className="p-3 text-[11px] flex-1 overflow-y-auto">
                <input placeholder="Search files..." className="w-full border rounded px-2 py-1.5 text-[11px] focus:outline-none transition-colors"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-primary)'}
                />
              </div>
            )}
            {activePanel === 'git' && (
              <div className="p-3 text-[11px] flex-1 overflow-y-auto">
                <div className="mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Changes</div>
                {Array.from(filesRef.current.keys()).map((f) => (
                  <div key={f} className="py-0.5 flex items-center gap-1" style={{ color: 'var(--accent-green)' }}>
                    <span className="text-[9px]">M</span><span>{f}</span>
                  </div>
                ))}
                {filesRef.current.size === 0 && <div style={{ color: 'var(--text-muted)' }}>No changes</div>}
              </div>
            )}
            {activePanel === 'extensions' && (
              <div className="p-3 text-[11px] flex-1 overflow-y-auto">
                <div className="mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Installed</div>
                {['AI Assistant', 'Monaco Editor', 'Live Preview', 'Terminal', 'File Explorer'].map((ext) => (
                  <div key={ext} className="py-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
                      <Code size={14} style={{ color: 'var(--accent-blue)' }} />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium">{ext}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Active</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activePanel === 'projects' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  <button
                    onClick={() => {
                      if (!isSignedIn) { setSignInMessage('Sign in to import your project files'); return; }
                      // Trigger popunder on import
                      try { (window as any).triggerPopunder?.(); } catch {}
                      setShowImportModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
                    style={{ background: 'rgba(0,122,204,0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(0,122,204,0.3)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.25)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,122,204,0.15)'}
                  >
                    <Upload size={12} /> Import Project
                  </button>
                </div>
                <ProjectManager
                  currentProjectId={currentProjectId}
                  onSelectProject={setCurrentProjectId}
                  onProjectSaved={handleProjectSaved}
                  files={filesRef.current}
                  onLoadProject={loadProjectFiles}
                  onLoadChatHistory={loadChatHistory}
                  refreshTrigger={storageRefresh}
                  isSignedIn={isSignedIn}
                />
                {/* Native Banner Ad - Bottom of sidebar */}
                <div className="border-t p-2" style={{ borderColor: 'var(--border-primary)' }}>
                  <InlineAd id="sidebar-native" format="square" />
                </div>
              </div>
            )}
          </div>
        )}

        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="flex flex-col items-center justify-center w-8 shrink-0 border-r transition-colors"
            style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Show Sidebar (Ctrl+B)"
          >
            <PanelLeft size={14} />
          </button>
        )}

        {/* Main content area — uses flex-1 to fill remaining space */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {openFiles.length > 0 && (
            <TabBar openFiles={openFiles} activeFile={activeFile} onTabClick={setActiveFile} onTabClose={handleFileClose} files={files} />
          )}

          {/* Middle section: Chat + Editor/Preview — flex-1 fills remaining vertical space */}
          <div className="flex-1 flex min-h-0">
            {/* Chat Panel */}
            {showChat && (
              <div className="flex flex-col shrink-0 border-r" style={{ width: chatWidth, borderColor: 'var(--border-primary)' }}>
                <AgentLoader isActive={aiLoading} task={aiTask} />
                <div className="flex-1 min-h-0">
                  <ChatPanel
                    messages={messages.filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system')}
                    onSend={handleSend}
                    isStreaming={isStreaming}
                    activeTasks={activeTasks}
                    completedTasks={completedTasks}
                    onAiAction={handleAiAction}
                    selectedCode={selectedCode}
                    promptLimit={{ remaining, isLimited, isSignedIn }}
                    onSignIn={() => signIn('google')}
                  />
                </div>
                {/* Desktop inline ad below chat */}
                <InlineAd id="desktop-chat" format="banner" />
              </div>
            )}

            {/* Editor + Preview area */}
            <div className="flex-1 flex min-w-0 min-h-0" data-editor-container>
              {/* Code Editor */}
              <div className="min-w-0 flex-1" style={{ width: showPreview ? `${100 - previewWidth}%` : '100%' }}>
                <CodeEditor filePath={activeFile} content={activeFile ? files.get(activeFile) || '' : ''} onSave={handleFileSave} />
              </div>

              {/* Preview Panel */}
              {showPreview && (
                <>
                  {/* Drag handle */}
                  <div
                    className="w-1 shrink-0 cursor-col-resize group relative flex items-center justify-center"
                    style={{ background: 'var(--border-primary)' }}
                    onMouseDown={handlePreviewDragStart}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                    onMouseLeave={(e) => { if (!previewDragging.current) e.currentTarget.style.background = 'var(--border-primary)'; }}
                  >
                    <div className="absolute w-0.5 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--accent-blue)' }} />
                  </div>
                  <div style={{ width: `${previewWidth}%` }} className="min-w-0 shrink-0">
                    <PreviewPanel files={filesRef.current} onClose={() => setShowPreview(false)} version={renderCount} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Terminal section — fixed height at bottom with drag handle */}
          {showTerminal && (
            <div className="shrink-0 flex flex-col border-t" style={{ borderColor: 'var(--border-primary)' }}>
              {/* Drag handle */}
              <div
                className="h-1 shrink-0 cursor-row-resize group flex items-center justify-center"
                style={{ background: 'var(--border-primary)' }}
                onMouseDown={handleTerminalDragStart}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
                onMouseLeave={(e) => { if (!terminalDragging.current) e.currentTarget.style.background = 'var(--border-primary)'; }}
              >
                <div className="w-8 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--accent-blue)' }} />
              </div>
              <div style={{ height: terminalHeight }} className="min-h-[60px]">
            <TerminalPanel ref={terminalRef} logs={logs} onClear={() => setLogs([])} files={filesRef.current} onFileCreate={handleTerminalFileCreate} onFileDelete={handleTerminalFileDelete} />
              </div>
            </div>
          )}
        </div>
      </div>

      <StatusBar
        fileCount={fileCount}
        activeFile={activeFile}
        isStreaming={isStreaming}
        showChat={showChat}
        onToggleChat={() => setShowChat((p) => !p)}
        showPreview={showPreview}
        onTogglePreview={() => {
          if (!showPreview) {
            // Trigger direct link ad when opening preview
            try { (window as any).triggerDirectLink?.(); } catch {}
          }
          setShowPreview((p) => !p);
        }}
        showTerminal={showTerminal}
        onToggleTerminal={() => setShowTerminal((p) => !p)}
        onOpenDownload={() => {
          if (!isSignedIn) { setSignInMessage('Sign in to export and download your project'); return; }
          // Trigger popunder and smartlink on export
          try { (window as any).triggerPopunder?.(); } catch {}
          try { (window as any).triggerSmartlink?.(); } catch {}
          setShowDownloadModal(true);
        }}
        onOpenProjects={() => { setActivePanel('projects'); setShowSidebar(true); }}
        currentProjectId={currentProjectId}
      />

      <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} commands={commands} />

      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} />

      {achievementPopup && (
        <AchievementPopup achievement={achievementPopup} onClose={dismissAchievement} />
      )}

      {showImportModal && (
        <FileImport
          onImport={async (files) => {
            Object.entries(files).forEach(([path, content]) => {
              filesRef.current.set(path, content);
            });
            // Save imported files to IndexedDB
            if (currentProjectId) {
              try {
                const projRes = await fetch(`/api/projects/${currentProjectId}`);
                const projData = await projRes.json();
                const projectName = projData.project?.name || 'project';
                saveFilesToLocal(currentProjectId, projectName);
              } catch {
                saveFilesToLocal(currentProjectId, 'project');
              }
            }
            forceRender((n) => n + 1);
            addLog('info', `Imported ${Object.keys(files).length} files`);
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowDownloadModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <AdGateDownload
              projectName={currentProjectId ? 'project' : 'project'}
              projectId={currentProjectId || 'local'}
              files={filesRef.current}
              onDownloadComplete={() => setShowDownloadModal(false)}
            />
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}
