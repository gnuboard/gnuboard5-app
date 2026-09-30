/**
 * 오류 → 사용자 문구 (ARCH §8 오류 표시 규칙). 순수 함수 — ErrorState 와 ErrorBoundary 가 공유한다.
 * 401 로그인 유도·403 권한 안내는 화면이 분기하므로 여기서는 재시도 가능 여부와 문구만 정한다.
 */
import { isApiError } from '../api/apiError';
import { t } from '../i18n';
import { errorMessage } from '../lib/errors';

export interface ErrorCopy {
  title: string;
  body: string;
  /** 재시도 버튼을 보일지 — 스키마/4xx 는 재시도해도 같은 결과라 숨긴다. */
  retryable: boolean;
  kind: 'network' | 'timeout' | 'schema' | 'rateLimited' | 'http' | 'unknown';
}

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;

export function describeError(error: unknown, options: { cooldownMs?: number } = {}): ErrorCopy {
  if (isApiError(error)) {
    if (error.isTimeout) {
      return { kind: 'timeout', title: t('error.network_title'), body: t('error.timeout_body'), retryable: true };
    }
    if (error.isNetwork) {
      return { kind: 'network', title: t('error.network_title'), body: t('error.network_body'), retryable: true };
    }
    if (error.isSchema) {
      return { kind: 'schema', title: t('error.generic_title'), body: t('error.schema_body'), retryable: false };
    }
    if (error.status === HTTP_TOO_MANY_REQUESTS) {
      const seconds = Math.max(1, Math.ceil((options.cooldownMs ?? 0) / 1000));
      return {
        kind: 'rateLimited',
        title: t('error.rate_limited_title'),
        body: options.cooldownMs
          ? t('error.rate_limited_body', { seconds })
          : errorMessage(error, t('error.generic_body')),
        retryable: true,
      };
    }
    return {
      kind: 'http',
      title: t('error.generic_title'),
      body: errorMessage(error, t('error.generic_body')),
      retryable: error.status >= HTTP_SERVER_ERROR_MIN,
    };
  }
  return {
    kind: 'unknown',
    title: t('error.generic_title'),
    body: errorMessage(error, t('error.generic_body')),
    retryable: true,
  };
}
