import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">Something went wrong</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-paper">This page hit an unexpected error</h1>
          <p className="mt-3 max-w-sm text-sm text-slate-soft">
            Reloading usually fixes it. If it keeps happening, try signing in again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-amber px-5 py-3 text-sm font-semibold text-ink hover:bg-amber-dim"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
