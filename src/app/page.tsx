'use client';

export default function Home() {
  return (
    <div
      className="h-screen flex items-center justify-center"
      style={{ background: '#0a0a0a', color: '#fff' }}
    >
      <div className="text-center max-w-md px-6">
        <div
          className="text-5xl font-bold mb-4"
          style={{
            background: 'linear-gradient(90deg, #0070f3, #00bfff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Vibe Coder Pro
        </div>
        <div className="text-sm" style={{ color: '#888' }}>
          The AI workspace is being rebuilt. Check back soon.
        </div>
      </div>
    </div>
  );
}
