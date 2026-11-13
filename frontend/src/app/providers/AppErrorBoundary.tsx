import { Component, type ReactNode } from 'react';
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="status-page" role="alert">
          <h1>화면을 불러올 수 없습니다.</h1>
          <p>페이지를 새로고침한 후 다시 시도해 주세요.</p>
          <button type="button" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </main>
      );
    return this.props.children;
  }
}
