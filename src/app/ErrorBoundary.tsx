/**
 * 앱 전역 ErrorBoundary (PLAN T-P0-09).
 * - 렌더 중 throw 를 잡아 폴백(제목·설명·'다시 시작')을 그리고 `onError`(App 에서 Sentry.captureException) 를 1회 호출.
 * - '다시 시작' 은 상태만 초기화해 자식을 다시 마운트한다 — 저장소(결제 pending 세션 SecureStore 등)는 건드리지 않는다.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from '../shared/i18n';
import { appLog } from '../shared/lib/debug/appLog';
import { EmptyState } from '../shared/ui/EmptyState';
import { useTheme } from '../shared/ui/theme/ThemeProvider';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** 크래시 리포터(Sentry 등). throw 된 오류와 React componentStack 을 받는다. */
  onError?: (error: Error, componentStack: string | null | undefined) => void;
  /** 폴백을 대체하고 싶을 때(테스트/특수 화면). */
  renderFallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function DefaultFallback({ onReset }: { onReset: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="error-boundary-fallback">
      <EmptyState
        title={t('error.boundary_title')}
        subtitle={t('error.boundary_body')}
        action={{ label: t('error.restart'), onPress: onReset }}
      />
    </View>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const normalized = toError(error);
    appLog.error('ErrorBoundary', normalized, { componentStack: info.componentStack });
    try {
      this.props.onError?.(normalized, info.componentStack);
    } catch {
      // 리포터 실패가 폴백 렌더를 막으면 안 된다.
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.renderFallback) return this.props.renderFallback(error, this.reset);
    return <DefaultFallback onReset={this.reset} />;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center' },
});
