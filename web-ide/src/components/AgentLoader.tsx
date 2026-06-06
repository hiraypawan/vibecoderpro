'use client';

import { useState, useEffect } from 'react';
import { Brain, Code, Search, Lightbulb, PenTool, BarChart3, Shield, Zap, Cpu, Globe } from 'lucide-react';

interface AgentLoaderProps {
  isActive: boolean;
  task?: string;
}

const AGENTS = [
  { name: 'Research Agent', icon: Search, color: '#79c0ff', role: 'Analyzing request' },
  { name: 'Architecture Agent', icon: Cpu, color: '#d2a8ff', role: 'Planning structure' },
  { name: 'Code Agent', icon: Code, color: '#56d364', role: 'Writing code' },
  { name: 'Design Agent', icon: PenTool, color: '#f0c040', role: 'Styling UI' },
  { name: 'Optimization Agent', icon: Zap, color: '#ffa657', role: 'Optimizing' },
  { name: 'Security Agent', icon: Shield, color: '#f97583', role: 'Checking security' },
  { name: 'Analytics Agent', icon: BarChart3, color: '#79c0ff', role: 'Measuring' },
  { name: 'Knowledge Agent', icon: Lightbulb, color: '#d29922', role: 'Researching' },
  { name: 'Web Agent', icon: Globe, color: '#56d364', role: 'Searching web' },
];

export default function AgentLoader({ isActive, task }: AgentLoaderProps) {
  const [activeAgents, setActiveAgents] = useState<number[]>([]);
  const [currentPhase, setCurrentPhase] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setActiveAgents([]);
      setCurrentPhase(0);
      return;
    }

    // Simulate agents joining over time
    const phases = [
      [0],           // Research starts
      [0, 1],        // Architecture joins
      [0, 1, 2],     // Code joins
      [0, 1, 2, 3],  // Design joins
      [0, 1, 2, 3, 4], // Optimization joins
      [0, 1, 2, 3, 4, 5], // Security joins
    ];

    let phase = 0;
    const interval = setInterval(() => {
      if (phase < phases.length - 1) {
        phase++;
        setCurrentPhase(phase);
        setActiveAgents(phases[phase]);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-primary)', background: 'rgba(0,122,204,0.03)' }}>
      {/* Main status */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <Brain size={14} style={{ color: 'var(--accent-blue)' }} className="animate-pulse" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-ping" style={{ background: 'var(--accent-green)' }} />
        </div>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
          {task || 'AI is working...'}
        </span>
      </div>

      {/* Active agents */}
      <div className="flex flex-wrap gap-1">
        {activeAgents.map((agentIdx) => {
          const agent = AGENTS[agentIdx];
          const Icon = agent.icon;
          return (
            <div
              key={agentIdx}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]"
              style={{
                background: `${agent.color}15`,
                border: `1px solid ${agent.color}30`,
                color: agent.color,
                animation: 'fadeIn 0.3s ease-in',
              }}
            >
              <Icon size={9} />
              <span>{agent.name}</span>
              <span className="opacity-60">• {agent.role}</span>
            </div>
          );
        })}
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-1 mt-2">
        {AGENTS.slice(0, 6).map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full transition-all duration-500"
            style={{
              width: activeAgents.includes(i) ? '16px' : '4px',
              background: activeAgents.includes(i) ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
            }}
          />
        ))}
        <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>
          {activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''} active
        </span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
      `}} />
    </div>
  );
}
