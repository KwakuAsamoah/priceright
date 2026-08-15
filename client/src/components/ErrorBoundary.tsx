import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error) => void;
  /** When any value changes, a caught error is cleared so navigation can recover. */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps: Props) {
    if (!this.state.hasError || this.props.resetKeys === undefined) {
      return;
    }

    const prevKeys = prevProps.resetKeys;
    const nextKeys = this.props.resetKeys;
    if (prevKeys === nextKeys) {
      return;
    }

    if (
      prevKeys == null
      || nextKeys == null
      || prevKeys.length !== nextKeys.length
      || prevKeys.some((key, index) => key !== nextKeys[index])
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: '#64748b',
        }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F2847', marginBottom: '8px' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: '13px', marginBottom: '16px' }}>
            This section could not load. Your data is safe.
          </div>
          <button
            type="button"
            onClick={() => this.handleReset()}
            style={{
              backgroundColor: '#16A34A',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Convenience wrapper for tab content
export function TabErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          This tab could not load. Try refreshing the page.
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
