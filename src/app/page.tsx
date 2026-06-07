'use client';

import dynamic from 'next/dynamic';

const Workspace = dynamic(() => import('@/components/Workspace'), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
      <div className="text-center">
        <div
          className="text-3xl font-bold mb-2"
          style={{
            background: 'linear-gradient(90deg, #0070f3, #00bfff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          VIBE
        </div>
        <div className="text-xs" style={{ color: '#888' }}>Loading workspace...</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <Workspace />;
}
