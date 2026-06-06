'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Star, Flame, Zap, Target, Crown, Medal, Award } from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
  unlocked: boolean;
  unlockedAt?: Date;
}

interface AchievementPopupProps {
  achievement: Achievement;
  onClose: () => void;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_prompt', title: 'First Contact', description: 'Sent your first message to Vibe AI', icon: Star, color: '#f0c040', unlocked: false },
  { id: 'five_prompts', title: 'Getting Hooked', description: 'Sent 5 messages — you\'re on a roll!', icon: Flame, color: '#f97583', unlocked: false },
  { id: 'ten_prompts', title: 'Deep Thinker', description: '10 messages — your ideas are taking shape', icon: Zap, color: '#d2a8ff', unlocked: false },
  { id: 'first_code', title: 'Code Warrior', description: 'Created your first file', icon: Target, color: '#56d364', unlocked: false },
  { id: 'first_project', title: 'Architect', description: 'Saved your first project', icon: Trophy, color: '#f0c040', unlocked: false },
  { id: 'night_owl', title: 'Night Owl', description: 'Coding past midnight — dedication!', icon: Crown, color: '#79c0ff', unlocked: false },
  { id: 'speed_demon', title: 'Speed Demon', description: 'Sent 3 messages in under 30 seconds', icon: Zap, color: '#ffa657', unlocked: false },
  { id: 'streak_3', title: 'On Fire', description: '3-day usage streak', icon: Flame, color: '#f97583', unlocked: false },
  { id: 'master_builder', title: 'Master Builder', description: 'Created 5+ files in one session', icon: Medal, color: '#f0c040', unlocked: false },
  { id: 'vip', title: 'VIP Member', description: 'Signed in — you\'re one of us now', icon: Award, color: '#d2a8ff', unlocked: false },
];

export function AchievementPopup({ achievement, onClose }: AchievementPopupProps) {
  const Icon = achievement.icon;

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="achievement-popup"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 10000,
        background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.98), rgba(30, 37, 48, 0.98))',
        border: `2px solid ${achievement.color}`,
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${achievement.color}33`,
        animation: 'achievementSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        maxWidth: '320px',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: `${achievement.color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={24} color={achievement.color} />
      </div>
      <div>
        <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', color: achievement.color, fontWeight: 700 }}>
          Achievement Unlocked
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e6edf3', marginTop: '2px' }}>
          {achievement.title}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
          {achievement.description}
        </div>
      </div>
    </div>
  );
}

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>(ACHIEVEMENTS);
  const [currentPopup, setCurrentPopup] = useState<Achievement | null>(null);
  const [stats, setStats] = useState({
    prompts: 0,
    filesCreated: 0,
    projectsSaved: 0,
    streak: 0,
  });

  const unlockAchievement = useCallback((id: string) => {
    setAchievements((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found && !found.unlocked) {
        const updated = prev.map((a) =>
          a.id === id ? { ...a, unlocked: true, unlockedAt: new Date() } : a
        );
        setCurrentPopup({ ...found, unlocked: true, unlockedAt: new Date() });
        return updated;
      }
      return prev;
    });
  }, []);

  const trackPrompt = useCallback(() => {
    setStats((prev) => {
      const newStats = { ...prev, prompts: prev.prompts + 1 };

      // Check achievements
      if (newStats.prompts === 1) unlockAchievement('first_prompt');
      if (newStats.prompts === 5) unlockAchievement('five_prompts');
      if (newStats.prompts === 10) unlockAchievement('ten_prompts');

      // Night owl check (past midnight)
      const hour = new Date().getHours();
      if (hour >= 0 && hour < 5) unlockAchievement('night_owl');

      return newStats;
    });
  }, [unlockAchievement]);

  const trackFileCreated = useCallback(() => {
    setStats((prev) => {
      const newStats = { ...prev, filesCreated: prev.filesCreated + 1 };
      if (newStats.filesCreated === 1) unlockAchievement('first_code');
      if (newStats.filesCreated >= 5) unlockAchievement('master_builder');
      return newStats;
    });
  }, [unlockAchievement]);

  const trackProjectSaved = useCallback(() => {
    setStats((prev) => {
      const newStats = { ...prev, projectsSaved: prev.projectsSaved + 1 };
      if (newStats.projectsSaved === 1) unlockAchievement('first_project');
      return newStats;
    });
  }, [unlockAchievement]);

  const trackSignedIn = useCallback(() => {
    unlockAchievement('vip');
  }, [unlockAchievement]);

  const dismissPopup = useCallback(() => {
    setCurrentPopup(null);
  }, []);

  // Save/load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vibe_achievements');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAchievements((prev) =>
          prev.map((a) => {
            const saved = parsed.find((s: any) => s.id === a.id);
            return saved?.unlocked ? { ...a, unlocked: true, unlockedAt: new Date(saved.unlockedAt) } : a;
          })
        );
        const savedStats = localStorage.getItem('vibe_stats');
        if (savedStats) setStats(JSON.parse(savedStats));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('vibe_achievements', JSON.stringify(achievements));
    localStorage.setItem('vibe_stats', JSON.stringify(stats));
  }, [achievements, stats]);

  return {
    achievements,
    currentPopup,
    stats,
    trackPrompt,
    trackFileCreated,
    trackProjectSaved,
    trackSignedIn,
    dismissPopup,
  };
}
