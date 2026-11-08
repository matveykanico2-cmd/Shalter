import { Component, type ErrorInfo, type ReactNode } from "react";

import styles from "./app-error-boundary.module.css";

type Props = { children?: ReactNode };
type State = { failed: boolean };

/** Последняя защита оболочки: ошибка экрана не должна оставлять нативное приложение белым. */
export class AppErrorBoundary extends Component<Props, State> {
  public state: State = { failed: false };

  public static getDerivedStateFromError(): State {
    return { failed: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Необработанная ошибка интерфейса Shalter", error, info.componentStack);
  }

  public render() {
    return this.state.failed ? <AppErrorScreen /> : this.props.children;
  }
}

/** Также используется errorElement роутера для ошибок внутри экранов. */
export function AppErrorScreen() {
  return (
    <main className={styles.screen} role="alert">
      <h1>Не удалось открыть экран</h1>
      <p>Перезапустите приложение. Ваши сообщения и данные аккаунта не потеряны.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Перезапустить
      </button>
    </main>
  );
}
