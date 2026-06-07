'use client';

import { useState, useRef, useCallback, useEffect, useMemo, forwardRef } from 'react';
import { runMultiAgentPipeline, PipelineResult } from '@/lib/aiPipeline';
import { usePromptLimit } from '@/lib/usePromptLimit';
import { useAchievements } from '@/components/Achievements';
import { saveLocalProject } from '@/lib/localDb';
import ChatPanel from '@/components/ChatPanel';
import CodeEditor from '@/components/CodeEditor';
import PreviewPanel from '@/components/PreviewPanel';
import TerminalPanel, { TerminalHandle } from '@/components/TerminalPanel';
import FileTree from '@/components/FileTree';
import TabBar from '@/components/TabBar';
import StatusBar from '@/components/StatusBar';
import Toolbar from '@/components/Toolbar';
import ActivityBar from '@/components/ActivityBar';
import ProjectManager from '@/components/ProjectManager';
import LoginButton from '@/components/LoginButton';
import StorageBar from '@/components/StorageBar';
import AgentLoader from '@/components/AgentLoader';
import ShareModal from '@/components/ShareModal';
import AdGateDownload from '@/components/AdGateDownload';
import FileImport from '@/components/FileImport';
import MobileAdBanner from '@/components/MobileAdBanner';
import { checkAdFreePass } from '@/lib/ads';

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'warn' | 'system';
  message: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `You are an elite creative frontend engineer with the design taste of a top-tier studio (Linear, Vercel, Stripe, Apple, Figma, Notion, Arc Browser). You do NOT produce generic SaaS templates. You have a STRONG point of view.

## OUTPUT FORMAT
Output COMPLETE code files using <write> tags. NO markdown, NO code fences, NO explanations outside tags.

<write file="index.html">...complete file content...</write>
<write file="styles.css">...complete file content...</write>
<write file="script.js">...complete file content...</write>

For single-file changes, use <edit> with <search>/<replace> inside.

## CORE RULES (non-negotiable)

1. VARIED DESIGNS. The pipeline injects a THEME block (palette, fonts, layout, motifs, motion, class vocabulary). Honor it completely. NEVER default to "dark #0a0a0a + #0070f3 + Inter + 6 feature cards" — that is forbidden. If the theme says brutalist, go brutalist. If glass, go frosted glass. If terminal, go green-on-black. Each theme is a DIFFERENT UNIVERSE.

2. REAL CONTENT ONLY. No "Lorem ipsum". No "Feature 1/2/3". Use realistic product names (Loop, Pivot, Cohort, Drift, Stack, Atlas, Quanta), real feature names with real descriptions, real prices, real CTAs (not just "Sign Up" — try "Get the playbook", "Start building free", "Deploy in 60 seconds").

3. COMPLETE FILES, NO TRUNCATION. No "..." or "// add more" or "/* continue */". Every file is finished. If you open a div, close it. If you write an if, write the body.

4. SEMANTIC CLASS NAMES PER THEME. Don't blindly use .navbar/.hero/.feature-card. Use names that match the aesthetic:
   - Brutalist: .brutal-block, .raw-button, .hard-shadow
   - Glass: .glass-panel, .frosted-card, .orb-1
   - Cyberpunk: .neon-glow, .scanlines, .hud-frame
   - Terminal: .term-prompt, .ascii-divider, .cmd-output
   - Editorial: .dropcap, .pull-quote, .byline
   - Soft SaaS: .pill-chip, .soft-card, .lavender-bg
   Match the theme vocabulary given to you.

5. BOLD DESIGN CHOICES. Asymmetric layouts. Mixed font sizes (8rem headlines + 0.875rem captions). Unexpected elements (rotated stamps, oversized numbers, terminal snippets, magazine pull quotes, hand-drawn arrows). Real micro-interactions. One or two "wow" visual moments per page.

6. PRODUCTION CSS. CSS variables, clamp(), modern features (aspect-ratio, gap, grid-template-areas, color-mix, :has()). Responsive with 2+ breakpoints. Smooth or snappy per the theme.

7. VANILLA JS, NO FRAMEWORKS. ES6+. addEventListener, IntersectionObserver, requestAnimationFrame.

8. 3-FILE STRUCTURE for new pages. CSS and JS will be generated separately — keep class names consistent.

9. THINK BEFORE WRITING. Decide: product, audience, the ONE feeling (speed/trust/delight/power), design references. Then build for that feeling, not for a generic template.

You are NOT a template generator. You are a designer who codes. Every output should look hand-crafted by a senior designer who cares.`;

function buildFileTree(files: Map<string, string>) {
  const nodes: any[] = [];
  for (const path of files.keys()) {
    nodes.push({ name: path.split('/').pop(), path, type: 'file' as const });
  }
  return nodes;
}

export default function Workspace() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const filesRef = useRef<Map<string, string>>(new Map());
  const [renderCount, setRenderCount] = useState(0);
  const forceRender = useCallback((fn: (n: number) => number) => setRenderCount(fn), []);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'explorer' | 'search' | 'git' | 'extensions' | 'projects'>('explorer');
  const [showPreview, setShowPreview] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chat' | 'editor' | 'preview' | 'terminal' | 'projects'>('chat');
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('Untitled');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTask, setAiTask] = useState('');
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [storageRefresh, setStorageRefresh] = useState(0);
  const [adFreePass, setAdFreePass] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const { remaining, isLimited, isSignedIn, trackPrompt } = usePromptLimit();
  const { trackPrompt: trackAchievementPrompt, trackFileCreated, trackProjectSaved, trackSignedIn } = useAchievements();
  const terminalRef = useRef<TerminalHandle>(null);

  useEffect(() => { checkAdFreePass('local-session').then(setAdFreePass).catch(() => {}); }, []);
  useEffect(() => { if (isSignedIn) trackSignedIn(); }, [isSignedIn, trackSignedIn]);

  const files = filesRef.current;
  const fileNodes = useMemo(() => buildFileTree(files), [files.size, renderCount]);
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

  const loadProjectFiles = useCallback((filesObj: Record<string, string>, projectId?: string, projectName?: string) => {
    filesRef.current.clear();
    Object.entries(filesObj).forEach(([path, content]) => filesRef.current.set(path, content));
    const paths = Object.keys(filesObj);
    setOpenFiles(paths.slice(0, 10));
    if (paths.length > 0) setActiveFile(paths[0]);
    if (projectId) setCurrentProjectId(projectId);
    if (projectName) setCurrentProjectName(projectName);
    forceRender((n) => n + 1);
    addLog('info', `Loaded ${paths.length} files`);
  }, [addLog, forceRender]);

  const saveFilesToLocal = useCallback(async (projectId: string, projectName: string) => {
    const filesObj: Record<string, string> = {};
    filesRef.current.forEach((content, path) => { filesObj[path] = content; });
    if (Object.keys(filesObj).length > 0) {
      await saveLocalProject(projectId, projectName, filesObj);
      if (isSignedIn) {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesObj }),
          });
        } catch {}
      }
      setLastSaved(new Date());
      trackProjectSaved();
    }
  }, [isSignedIn, trackProjectSaved]);

  const handleNewProject = useCallback(async () => {
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCurrentProjectId(id);
    setCurrentProjectName('Untitled');
    filesRef.current.clear();
    setOpenFiles([]);
    setActiveFile(null);
    setMessages([]);
    forceRender((n) => n + 1);
  }, [forceRender]);

  const handleSelectProject = useCallback((id: string | null) => {
    setShowProjects(false);
    if (id) setCurrentProjectId(id);
  }, []);

  const handleSend = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || aiLoading) return;
    if (isLimited) { addLog('warn', 'Prompt limit reached — sign in for unlimited'); return; }
    const ok = await trackPrompt();
    if (!ok) { addLog('warn', 'Prompt limit reached'); return; }
    trackAchievementPrompt();

    setAiLoading(true);
    setAiTask(userMessage);
    setActiveTasks([userMessage]);
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const result: PipelineResult = await runMultiAgentPipeline({
        systemPrompt: SYSTEM_PROMPT,
        fileContext: null,
        history: [],
        userMessage,
        existingFiles: new Set(filesRef.current.keys()),
        onStreamUpdate: (content, phase) => {
          setAiTask(phase);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content }];
            }
            return [...prev, { role: 'assistant', content }];
          });
        },
        onPhaseChange: () => {},
      });

      const { parseToolBlocks } = await import('@/lib/parser');
      const blocks = parseToolBlocks(result.content, new Set(filesRef.current.keys()));
      for (const block of blocks) {
        if (block.type === 'write' && block.content) {
          filesRef.current.set(block.path, block.content);
          trackFileCreated();
        }
      }
      const paths = Array.from(filesRef.current.keys());
      setOpenFiles(paths.slice(0, 10));
      if (paths.length > 0 && !activeFile) setActiveFile(paths[0]);
      forceRender((n) => n + 1);
      setActiveTasks([]);
      setCompletedTasks((prev) => [...prev, userMessage]);
      setTimeout(() => setCompletedTasks([]), 3000);
      addLog('success', `Generated ${blocks.length} file(s)` + (result.themeName ? ` · ${result.themeName}` : ''));

      const projectId = currentProjectId || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!currentProjectId) setCurrentProjectId(projectId);
      await saveFilesToLocal(projectId, currentProjectName);
    } catch (e: any) {
      addLog('error', e?.message || 'Generation failed');
      setMessages((prev) => [...prev, { role: 'assistant', content: `Boss, something broke: ${e?.message || 'unknown'}` }]);
    } finally {
      setAiLoading(false);
      setActiveTasks([]);
    }
  }, [aiLoading, isLimited, trackPrompt, trackAchievementPrompt, activeFile, currentProjectId, currentProjectName, addLog, forceRender, saveFilesToLocal, trackFileCreated]);

  const handleUpdateFile = useCallback((path: string, content: string) => {
    filesRef.current.set(path, content);
    forceRender((n) => n + 1);
  }, [forceRender]);

  const handleDownload = useCallback(() => {
    if (!isSignedIn) { setSignInMessage('Sign in with Google to download projects.'); return; }
    setShowDownloadModal(true);
  }, [isSignedIn]);

  const handleImport = useCallback(() => {
    if (!isSignedIn) { setSignInMessage('Sign in with Google to import files.'); return; }
    setShowImportModal(true);
  }, [isSignedIn]);

  const activeFileContent = activeFile ? filesRef.current.get(activeFile) || '' : '';

  const previewFiles = useMemo(() => {
    const m = new Map<string, string>();
    const html = filesRef.current.get('index.html');
    const css = filesRef.current.get('styles.css');
    const js = filesRef.current.get('script.js');
    if (html) m.set('index.html', html);
    if (css) m.set('styles.css', css);
    if (js) m.set('script.js', js);
    return m;
  }, [filesRef.current.size, activeFile, renderCount]);

  const handleTerminalClear = useCallback(() => setLogs([]), []);
  const handleFileCreate = useCallback((path: string, content: string) => {
    filesRef.current.set(path, content);
    if (!openFiles.includes(path)) setOpenFiles((prev) => [...prev, path]);
    setActiveFile(path);
    forceRender((n) => n + 1);
  }, [openFiles, forceRender]);
  const handleFileDelete = useCallback((path: string) => {
    filesRef.current.delete(path);
    setOpenFiles((prev) => prev.filter((p) => p !== path));
    if (activeFile === path) setActiveFile(openFiles.find((p) => p !== path) || null);
    forceRender((n) => n + 1);
  }, [activeFile, openFiles, forceRender]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a', color: '#e0e0e0' }}>
      {!isMobile && (
        <Toolbar
          activeTasks={activeTasks}
          completedTasks={completedTasks}
          fileCount={fileCount}
          onDownloadAll={handleDownload}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((p) => !p)}
          showTerminal={showTerminal}
          onToggleTerminal={() => setShowTerminal((p) => !p)}
        />
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {!isMobile && (
          <ActivityBar activePanel={activePanel} onPanelChange={setActivePanel} />
        )}

        {!isMobile && (
          <div className="w-64 border-r flex flex-col shrink-0" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <div className="p-3 text-xs uppercase tracking-wider font-semibold" style={{ color: '#888' }}>
              {activePanel === 'explorer' ? 'Explorer' : activePanel === 'projects' ? 'Projects' : activePanel}
            </div>
            <div className="flex-1 overflow-y-auto">
              {activePanel === 'explorer' && (
                <FileTree
                  nodes={fileNodes}
                  onFileOpen={(p) => {
                    setActiveFile(p);
                    if (!openFiles.includes(p)) setOpenFiles((prev) => [...prev, p]);
                  }}
                  activeFile={activeFile}
                />
              )}
              {activePanel === 'projects' && (
                <ProjectManager
                  currentProjectId={currentProjectId}
                  onSelectProject={(id) => { handleSelectProject(id); setShowProjects(false); }}
                  onProjectSaved={() => setStorageRefresh((n) => n + 1)}
                  files={files}
                  onLoadProject={(f) => loadProjectFiles(f)}
                  isMobile={false}
                  refreshTrigger={storageRefresh}
                  isSignedIn={isSignedIn}
                />
              )}
            </div>
            <div className="p-2 border-t" style={{ borderColor: '#1a1a1a' }}>
              <LoginButton showFull />
              <StorageBar refreshTrigger={storageRefresh} compact />
            </div>
          </div>
        )}

        {!isMobile && showChat && (
          <div className="border-r flex flex-col shrink-0" style={{ width: 380, background: '#0d0d0d', borderColor: '#1a1a1a' }}>
            <ChatPanel
              messages={messages}
              onSend={handleSend}
              isStreaming={aiLoading}
              activeTasks={activeTasks}
              completedTasks={completedTasks}
              promptLimit={{ remaining, isLimited, isSignedIn }}
              onSignIn={() => {/* login button in sidebar */}}
            />
          </div>
        )}

        {!isMobile && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <TabBar
              openFiles={openFiles}
              activeFile={activeFile}
              onTabClick={setActiveFile}
              onTabClose={(p) => {
                setOpenFiles((prev) => prev.filter((f) => f !== p));
                if (activeFile === p) setActiveFile(openFiles.find((f) => f !== p) || null);
              }}
              files={files}
            />
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                filePath={activeFile}
                content={activeFileContent}
                onSave={handleUpdateFile}
              />
            </div>
          </div>
        )}

        {!isMobile && showPreview && (
          <div className="overflow-hidden border-l" style={{ width: '50%', borderColor: '#1a1a1a' }}>
            <PreviewPanel files={previewFiles} version={renderCount} />
          </div>
        )}

        {isMobile && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {mobileTab === 'chat' && (
              <ChatPanel
                messages={messages}
                onSend={handleSend}
                isStreaming={aiLoading}
                activeTasks={activeTasks}
                completedTasks={completedTasks}
                promptLimit={{ remaining, isLimited, isSignedIn }}
                onSignIn={() => {}}
              />
            )}
            {mobileTab === 'editor' && (
              <>
                <TabBar
                  openFiles={openFiles}
                  activeFile={activeFile}
                  onTabClick={setActiveFile}
                  onTabClose={(p) => { setOpenFiles((prev) => prev.filter((f) => f !== p)); if (activeFile === p) setActiveFile(null); }}
                  files={files}
                />
                <div className="flex-1 overflow-hidden">
                  <CodeEditor filePath={activeFile} content={activeFileContent} onSave={handleUpdateFile} />
                </div>
              </>
            )}
            {mobileTab === 'preview' && <PreviewPanel files={previewFiles} version={renderCount} />}
            {mobileTab === 'terminal' && (
              <TerminalPanel ref={terminalRef} logs={logs} onClear={handleTerminalClear} files={files} onFileCreate={handleFileCreate} onFileDelete={handleFileDelete} />
            )}
            {mobileTab === 'projects' && (
              <ProjectManager
                currentProjectId={currentProjectId}
                onSelectProject={handleSelectProject}
                onProjectSaved={() => setStorageRefresh((n) => n + 1)}
                files={files}
                onLoadProject={(f) => loadProjectFiles(f)}
                isMobile
                refreshTrigger={storageRefresh}
                isSignedIn={isSignedIn}
              />
            )}
          </div>
        )}

        {aiLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
            <AgentLoader isActive={aiLoading} task={aiTask} />
          </div>
        )}

        {signInMessage && (
          <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setSignInMessage(null)}>
            <div className="p-6 rounded-lg max-w-sm text-center" style={{ background: '#1a1a1a', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
              <div className="text-lg font-semibold mb-2">Sign in required</div>
              <div className="text-sm mb-4" style={{ color: '#888' }}>{signInMessage}</div>
              <LoginButton showFull />
              <button onClick={() => setSignInMessage(null)} className="mt-3 px-4 py-2 text-xs" style={{ color: '#888' }}>Close</button>
            </div>
          </div>
        )}
      </div>

      {!isMobile && (
        <StatusBar
          fileCount={fileCount}
          activeFile={activeFile}
          isStreaming={aiLoading}
          showChat={showChat}
          onToggleChat={() => setShowChat((p) => !p)}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview((p) => !p)}
          showTerminal={showTerminal}
          onToggleTerminal={() => setShowTerminal((p) => !p)}
          onOpenDownload={handleDownload}
          onOpenProjects={() => setShowProjects(true)}
          currentProjectId={currentProjectId}
        />
      )}

      {isMobile && (
        <div className="flex justify-around items-center border-t shrink-0" style={{ background: '#0d0d0d', borderColor: '#1a1a1a', zIndex: 10, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {(['chat', 'editor', 'preview', 'terminal', 'projects'] as const).map((t) => (
            <button key={t} onClick={() => setMobileTab(t)} className="flex-1 py-3 text-xs capitalize" style={{ color: mobileTab === t ? '#0070f3' : '#888' }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {showShareModal && <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} projectTitle={currentProjectName} />}
      {showDownloadModal && <AdGateDownload projectName={currentProjectName} projectId={currentProjectId || ''} files={files} onDownloadComplete={() => setShowDownloadModal(false)} />}
      {showImportModal && <FileImport onImport={(f) => { loadProjectFiles(f); setShowImportModal(false); }} onClose={() => setShowImportModal(false)} />}
    </div>
  );
}
