import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
  failed: boolean;
  confirmReset: boolean;
  resetting: boolean;
  resetFailed: boolean;
};

export class ErrorBoundary extends Component<
  { children: ReactNode; onResetLocalData?: () => Promise<void> },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    failed: false,
    confirmReset: false,
    resetting: false,
    resetFailed: false,
  };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ui.boundary', { name: error.name, componentStack: info.componentStack });
  }
  private resetLocalData = async () => {
    if (!this.props.onResetLocalData) return;
    this.setState({ resetting: true, resetFailed: false });
    try {
      await this.props.onResetLocalData();
    } catch {
      this.setState({ resetting: false, resetFailed: true });
    }
  };
  render() {
    return this.state.failed ? (
      <main>
        <h1>Na'aseh hit a problem</h1>
        <p>Your locally saved work is still available. Reload to try again.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload Na'aseh
        </button>
        {this.props.onResetLocalData && !this.state.confirmReset ? (
          <button type="button" onClick={() => this.setState({ confirmReset: true })}>
            Show recovery options
          </button>
        ) : null}
        {this.state.confirmReset ? (
          <section aria-labelledby="local-recovery-heading">
            <h2 id="local-recovery-heading">Reset this browser's local cache</h2>
            <p>
              Server-saved data will download again. This permanently removes unsynced changes
              stored only in this browser.
            </p>
            {this.state.resetFailed ? (
              <p role="alert">The local cache could not be reset. No additional data was removed.</p>
            ) : null}
            <button type="button" disabled={this.state.resetting} onClick={this.resetLocalData}>
              {this.state.resetting ? 'Resetting…' : 'Confirm reset and sign out'}
            </button>
            <button
              type="button"
              disabled={this.state.resetting}
              onClick={() => this.setState({ confirmReset: false, resetFailed: false })}
            >
              Cancel
            </button>
          </section>
        ) : null}
      </main>
    ) : (
      this.props.children
    );
  }
}
