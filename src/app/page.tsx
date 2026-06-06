'use client';

import dynamic from 'next/dynamic';

const Workspace = dynamic(() => import('@/components/Workspace'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-center">
        <div className="text-2xl mb-3 animate-pulse" style={{ color: 'var(--accent-blue)' }}>VIBE</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading workspace...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Workspace />;
}
