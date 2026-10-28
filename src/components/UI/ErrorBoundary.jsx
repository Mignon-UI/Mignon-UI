import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught rendering exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      localStorage.removeItem('rp_current_room_id');
      sessionStorage.clear();
    } catch {
      // Ignore storage errors
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'var(--bg-app, #0f1117)',
          color: 'var(--text, #ffffff)',
          fontFamily: 'var(--font-body, system-ui, sans-serif)',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg-window, #1a1d27)',
            border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
            borderRadius: 'var(--r-md, 12px)',
            padding: '32px 24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <AlertTriangle size={24} />
            </div>

            <h2 style={{
              margin: '0 0 8px',
              fontSize: '1.25rem',
              fontWeight: 600,
              fontFamily: 'var(--font-head, inherit)'
            }}>
              Interface Error Encountered
            </h2>

            <p style={{
              margin: '0 0 20px',
              fontSize: '0.9rem',
              color: 'var(--text-muted, #9ca3af)',
              lineHeight: 1.5
            }}>
              Mignon encountered an unexpected rendering error. Your database and message histories remain safely stored.
            </p>

            {this.state.error?.message && (
              <pre style={{
                textAlign: 'left',
                background: 'var(--bg-input, rgba(0, 0, 0, 0.3))',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.8rem',
                color: '#f87171',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '120px',
                marginBottom: '24px'
              }}>
                {this.state.error.message}
              </pre>
            )}

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--pink, #ec4899)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} />
                Reload Application
              </button>

              <button
                type="button"
                onClick={this.handleResetAndReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, rgba(255, 255, 255, 0.15))',
                  background: 'transparent',
                  color: 'var(--text-sec, #d1d5db)',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={15} />
                Reset Session & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
