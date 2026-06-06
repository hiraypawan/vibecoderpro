'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderPlus, Trash2, Clock, Download, RefreshCw, AlertTriangle, Save, HardDrive } from 'lucide-react';
import StorageBar from './StorageBar';
import { getLocalProject, saveLocalProject, getAllLocalProjects, deleteLocalProject, LocalProject } from '@/lib/localDb';

interface Project {
  _id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  fileCount?: number;
  totalSize?: number;
  isLocal?: boolean;
}

interface ProjectManagerProps {
  currentProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onProjectSaved: () => void;
  files: Map<string, string>;
  onLoadProject: (files: Record<string, string>) => void;
  onLoadChatHistory?: (messages: Array<{role: string; content: string}>) => void;
  isMobile?: boolean;
  refreshTrigger?: number;
  isSignedIn?: boolean;
}

function useCountdown() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
}

export default function ProjectManager({
  currentProjectId,
  onSelectProject,
  onProjectSaved,
  files,
  onLoadProject,
  onLoadChatHistory,
  isMobile,
  refreshTrigger,
  isSignedIn = false,
}: ProjectManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  useCountdown();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      if (isSignedIn) {
        // Signed-in: fetch from MongoDB
        const res = await fetch('/api/projects');
        const data = await res.json();
        setProjects(data.projects || []);
      } else {
        // Anonymous: fetch from IndexedDB only (device-local, 24h expiry)
        const localProjects = await getAllLocalProjects();
        setProjects(localProjects.map(p => ({
          _id: p.id,
          name: p.name,
          createdAt: new Date(p.createdAt).toISOString(),
          updatedAt: new Date(p.createdAt).toISOString(),
          expiresAt: new Date(p.expiresAt).toISOString(),
          fileCount: Object.keys(p.files).length,
          totalSize: Object.values(p.files).reduce((sum, c) => sum + new TextEncoder().encode(c).byteLength, 0),
          isLocal: true,
        })));
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [isSignedIn]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      if (isSignedIn) {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        });
        const data = await res.json();
        if (data.project) {
          setProjects((prev) => [data.project, ...prev]);
          onSelectProject(data.project._id);
          setNewName('');
          setShowCreate(false);
        }
      } else {
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await saveLocalProject(localId, newName.trim(), {});
        const localProject: Project = {
          _id: localId,
          name: newName.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          fileCount: 0,
          totalSize: 0,
          isLocal: true,
        };
        setProjects((prev) => [localProject, ...prev]);
        onSelectProject(localId);
        setNewName('');
        setShowCreate(false);
      }
    } catch {
      // silent
    }
    setCreating(false);
  };

  const saveProject = async (id: string) => {
    setSaving(true);
    try {
      const filesObj: Record<string, string> = {};
      files.forEach((content, path) => { filesObj[path] = content; });

      const project = projects.find(p => p._id === id);
      const projectName = project?.name || 'project';

      if (project?.isLocal || id.startsWith('local_')) {
        // Local project: save to IndexedDB only
        await saveLocalProject(id, projectName, filesObj);
      } else {
        // Cloud project: save to both IndexedDB and MongoDB
        await saveLocalProject(id, projectName, filesObj);
        const res = await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filesObj }),
        });
        const data = await res.json();
        if (data.success) {
          setProjects((prev) =>
            prev.map((p) =>
              p._id === id
                ? { ...p, updatedAt: new Date().toISOString(), expiresAt: data.expiresAt }
                : p
            )
          );
        }
      }
      onProjectSaved();
    } catch {
      // silent
    }
    setSaving(false);
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    try {
      if (id.startsWith('local_')) {
        await deleteLocalProject(id);
      } else {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      }
      setProjects((prev) => prev.filter((p) => p._id !== id));
      if (currentProjectId === id) onSelectProject(null);
    } catch {
      // silent
    }
  };

  const loadProject = async (id: string) => {
    try {
      // Always select the project (even if empty)
      onSelectProject(id);
      
      // Try IndexedDB first (faster, always available)
      const localProject = await getLocalProject(id);
      if (localProject?.files && Object.keys(localProject.files).length > 0) {
        onLoadProject(localProject.files);
        // Load chat history from MongoDB only for signed-in cloud projects
        if (onLoadChatHistory && !id.startsWith('local_') && isSignedIn) {
          try {
            const chatRes = await fetch(`/api/projects/${id}/chat`);
            const chatData = await chatRes.json();
            if (chatData.messages?.length > 0) {
              onLoadChatHistory(chatData.messages);
            }
          } catch {}
        }
        return;
      }
      
      // Fall back to MongoDB for cloud projects
      if (!id.startsWith('local_')) {
        const res = await fetch(`/api/projects/${id}`);
        const data = await res.json();
        if (data.project?.files && Object.keys(data.project.files).length > 0) {
          onLoadProject(data.project.files);
          // Also save to IndexedDB for faster access next time
          await saveLocalProject(id, data.project.name, data.project.files);
          // Load chat history
          if (onLoadChatHistory && data.project.messages?.length > 0) {
            onLoadChatHistory(data.project.messages);
          }
        }
      }
    } catch {
      // silent
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m`;
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return `${mins}m ${secs}s`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-1.5">
          <HardDrive size={11} style={{ color: 'var(--accent-blue)' }} />
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-secondary)' }}>
            PROJECTS
          </span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--accent-blue)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          title="New Project"
        >
          <FolderPlus size={12} />
        </button>
      </div>

      {/* Storage Bar */}
      <StorageBar compact refreshTrigger={refreshTrigger} />

      {/* Create New */}
      {showCreate && (
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name..."
            className="w-full border rounded px-2 py-1.5 text-[11px] focus:outline-none"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            autoFocus
          />
          <div className="flex gap-1 mt-1.5">
            <button
              onClick={createProject}
              disabled={creating || !newName.trim()}
              className="flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ background: 'var(--accent-blue)', color: 'white', opacity: creating || !newName.trim() ? 0.5 : 1 }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); }}
              className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="px-3 py-2 border-b flex items-start gap-2" style={{ borderColor: 'var(--border-primary)', background: 'rgba(210,153,34,0.08)' }}>
        <AlertTriangle size={12} style={{ color: '#d29922', marginTop: 1, flexShrink: 0 }} />
        <div className="text-[10px] leading-relaxed" style={{ color: '#d29922' }}>
          {isSignedIn ? (
            <><strong>Projects auto-delete after 24 hours.</strong> Download your source code regularly. We cannot recover deleted projects.</>
          ) : (
            <><strong>Your work is saved on this device only.</strong> Sign in to sync projects across devices. All files auto-delete after 24 hours.</>
          )}
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-center">
            <RefreshCw size={14} className="animate-spin mx-auto" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : projects.length === 0 ? (
          <div className="p-4 text-center">
            <Folder size={24} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--text-muted)' }} />
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No projects yet</div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Create one to save your work</div>
          </div>
        ) : (
          projects.map((project) => {
            const isActive = project._id === currentProjectId;
            const timeLeft = getTimeRemaining(project.expiresAt);
            const isExpiringSoon = new Date(project.expiresAt).getTime() - Date.now() < 2 * 60 * 60 * 1000;

            return (
              <div
                key={project._id}
                className="px-3 py-2 border-b cursor-pointer transition-colors group"
                style={{
                  borderColor: 'var(--border-primary)',
                  background: isActive ? 'rgba(0,122,204,0.1)' : 'transparent',
                }}
                onClick={() => loadProject(project._id)}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Folder size={12} style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {project.name}
                    </span>
                    {project.isLocal && (
                      <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'rgba(210,153,34,0.15)', color: '#d29922' }}>
                        LOCAL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); saveProject(project._id); }}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--accent-green)' }}
                      title="Save current files"
                    >
                      <Save size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProject(project._id); }}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--accent-red)' }}
                      title="Delete project"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-0.5">
                    <Clock size={9} className={isExpiringSoon ? 'animate-pulse-warn' : ''} style={{ color: isExpiringSoon ? '#d29922' : 'var(--text-muted)' }} />
                    <span className={`text-[9px] ${isExpiringSoon ? 'animate-pulse-warn' : ''}`} style={{ color: isExpiringSoon ? '#d29922' : 'var(--text-muted)' }}>
                      {timeLeft}
                    </span>
                  </div>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    {project.fileCount || 0} files · {formatSize(project.totalSize)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Storage Info */}
      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Storage</span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>50 MB limit</span>
        </div>
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (projects.reduce((sum, p) => sum + (p.totalSize || 0), 0) / (50 * 1024 * 1024)) * 100)}%`,
              background: 'var(--accent-blue)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
