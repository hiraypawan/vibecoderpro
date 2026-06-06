export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1117',
      color: '#e6edf3',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    }}>
      <h1 style={{ fontSize: '6rem', fontWeight: 700, margin: 0, lineHeight: 1, color: '#58a6ff' }}>404</h1>
      <p style={{ fontSize: '1.5rem', margin: '0.5rem 0 2rem', color: '#8b949e' }}>Page not found</p>
      <a
        href="/"
        style={{
          padding: '0.75rem 1.5rem',
          background: '#238636',
          color: 'white',
          borderRadius: '6px',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
        }}
      >
        Back to IDE
      </a>
    </div>
  );
}
