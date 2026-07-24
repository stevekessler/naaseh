import { Component, type ErrorInfo, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ui.boundary', { name: error.name, componentStack: info.componentStack });
  }
  render() {
    return this.state.failed ? (
      <main>
        <h1>Na'aseh hit a problem</h1>
        <p>Your locally saved work is still available. Reload to try again.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
