export default function NotFound() {
  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      backgroundColor: '#f9fafb',
      color: '#111827'
    }}>
      <div>
        <h1 style={{
          display: 'inline-block',
          margin: '0 20px 0 0',
          padding: '0 23px 0 0',
          fontSize: '24px',
          fontWeight: 500,
          verticalAlign: 'top',
          lineHeight: '49px',
          borderRight: '1px solid rgba(17, 24, 39, 0.2)'
        }}>404</h1>
        <div style={{ display: 'inline-block', textAlign: 'left', verticalAlign: 'top' }}>
          <h2 style={{
            fontSize: '14px',
            fontWeight: 400,
            lineHeight: '49px',
            margin: 0
          }}>This page could not be found.</h2>
        </div>
      </div>
    </div>
  );
}
