import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <hr className="rule" />
          <p className="system-msg">Something went wrong.</p>
          <p><a href="/">Reload the app</a></p>
        </div>
      );
    }
    return this.props.children;
  }
}
