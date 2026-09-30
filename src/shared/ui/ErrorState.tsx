/**
 * 오류 상태 — 메시지 + 재시도 + 고객센터 링크 (PLAN T-P0-09). 문구/재시도 가능 여부는 errorCopy.describeError.
 */
import React from 'react';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { describeError } from './errorCopy';
import { t } from '../i18n';

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** 고객센터/문의 화면으로 — 없으면 링크를 숨긴다. */
  onSupport?: () => void;
  /** 429 남은 쿨다운(ms) — backoff.remainingCooldownMs 결과. */
  cooldownMs?: number;
  style?: EmptyStateProps['style'];
  testID?: string;
}

export function ErrorState({
  error,
  onRetry,
  retrying = false,
  onSupport,
  cooldownMs,
  style,
  testID,
}: ErrorStateProps) {
  const copy = describeError(error, { cooldownMs });
  const canRetry = copy.retryable && !!onRetry && !(cooldownMs && cooldownMs > 0);
  return (
    <EmptyState
      testID={testID ?? 'error-state'}
      style={style}
      icon="alert-circle-outline"
      title={copy.title}
      subtitle={copy.body}
      action={canRetry ? { label: t('common.retry'), onPress: onRetry, loading: retrying } : undefined}
      secondaryAction={onSupport ? { label: t('error.contact_support'), onPress: onSupport } : undefined}
    />
  );
}
