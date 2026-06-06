import type { Metadata } from 'next';

export default function PricingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      color: '#e6edf3',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem' }}>Pricing</h1>
        <div style={{
          background: '#161b22',
          borderRadius: '12px',
          padding: '2rem',
          border: '1px solid #30363d',
          marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: '1.25rem', color: '#58a6ff', marginBottom: '0.5rem' }}>Free</h2>
          <p style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>$0<span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#8b949e' }}>/forever</span></p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {['AI code generation', 'Unlimited projects', 'Live preview', 'Terminal', 'File explorer', 'Export & share'].map((f) => (
              <li key={f} style={{ padding: '0.375rem 0', color: '#c9d1d9' }}>✓ {f}</li>
            ))}
          </ul>
        </div>
        <div style={{
          background: '#161b22',
          borderRadius: '12px',
          padding: '2rem',
          border: '1px solid #238636',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: 16,
            background: '#238636',
            color: 'white',
            padding: '0.25rem 0.75rem',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>POPULAR</div>
          <h2 style={{ fontSize: '1.25rem', color: '#3fb950', marginBottom: '0.5rem' }}>Ad-Free Pass</h2>
          <p style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>$9<span style={{ fontSize: '0.875rem', fontWeight: 400, color: '#8b949e' }}>/one-time</span></p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {['Everything in Free', 'Remove all ads', 'Priority support', 'Exclusive features'].map((f) => (
              <li key={f} style={{ padding: '0.375rem 0', color: '#c9d1d9' }}>✓ {f}</li>
            ))}
          </ul>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#8b949e' }}>Contact us to get your ad-free code.</p>
        </div>
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <a href="/" style={{ color: '#58a6ff', textDecoration: 'none' }}>← Back to IDE</a>
        </div>
      </div>
    </div>
  );
}
