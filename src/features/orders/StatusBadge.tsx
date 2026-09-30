/**
 * 주문 상태 배지 — 알려진 상태는 번역 라벨, 모르는 상태는 서버 문자열. 취소·반품·품절은 error 톤, 진행 중은 primary.
 */
import React from 'react';
import { t } from '../../shared/i18n';
import { Badge } from '../../shared/ui/Badge';
import { progressIndex, statusLabelKey } from './rules';

export function statusLabel(status: string): string {
  const key = statusLabelKey(status);
  return key ? t(key) : status;
}

export function StatusBadge({ status, testID }: { status: string; testID?: string }) {
  const tone = progressIndex(status) < 0 ? 'error' : status === '완료' ? 'neutral' : 'primary';
  return <Badge label={statusLabel(status)} tone={tone} testID={testID} />;
}
