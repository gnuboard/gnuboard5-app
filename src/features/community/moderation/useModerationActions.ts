/**
 * 작성자 차단·신고 (T-P1B-05/07, ARCH §8.8). 글/댓글/이미지 공통. '더보기' 는 Alert 액션 시트, 신고는 ReportSheet
 * (사유 칩 + 상세) 를 화면이 렌더한다. 차단은 로컬 목록(게스트) + 서버 동기화(회원) — blockedUsers 가 처리한다.
 * 신고 429(10/h)·duplicate 200·auto_hidden(목록 invalidate) 을 여기서 안내한다.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { postKeys } from '../../../entities/post/queries';
import { submitReport, type ReportTargetType } from '../../../entities/report/api';
import { isApiError } from '../../../shared/api/client';
import { cooldownFor, remainingCooldownMs } from '../../../shared/api/backoff';
import { t } from '../../../shared/i18n';
import { appLog } from '../../../shared/lib/debug/appLog';
import { showToast } from '../../../shared/ui/Toast';
import type { ReportSheetProps } from './ReportSheet';
import { authorBlockKey, authorLabel, blockUser } from './blockedUsers';

export interface ModerationTarget {
  type: ReportTargetType;
  /** post/comment 'free/123', image 는 업로드 file_url(≤128). */
  key: string;
  label: string;
  author: { mb_id?: string; mb_nick?: string; wr_name: string };
}

export type AlertFn = typeof Alert.alert;

interface Deps {
  alert: AlertFn;
  boTable: string;
  qc: QueryClient;
}

function invalidateBoard({ qc, boTable }: Deps): void {
  void qc.invalidateQueries({ queryKey: postKeys.board(boTable) });
}

function reportFailureMessage(error: unknown): string {
  if (isApiError(error) && error.status === 429) {
    const rule = cooldownFor('POST', '/reports');
    const minutes = Math.ceil((remainingCooldownMs('POST', '/reports') || rule.cooldownMs) / 60_000);
    return t('report.rate_limited', { minutes, limit: rule.limit });
  }
  return t('report.failed');
}

async function sendReport(deps: Deps, target: ModerationTarget, reason: string, detail: string): Promise<void> {
  try {
    const res = await submitReport({ target_type: target.type, target_key: target.key, reason, detail });
    const message = res.duplicate
      ? t('report.duplicate')
      : res.auto_hidden
        ? t('report.thanks_hidden')
        : t('report.thanks');
    showToast(message);
    if (res.auto_hidden) invalidateBoard(deps);
  } catch (error: unknown) {
    appLog.warn('moderation', 'report failed', { error });
    showToast(reportFailureMessage(error), 'error');
  }
}

function askBlock(deps: Deps, target: ModerationTarget): void {
  const key = authorBlockKey(target.author);
  if (!key) {
    deps.alert(t('block.title'), t('block.unavailable'));
    return;
  }
  const name = authorLabel(target.author) || t('board.author_anonymous');
  const onPress = () => {
    blockUser({ key, label: name })
      .then(() => {
        showToast(t('block.done', { name }));
        invalidateBoard(deps);
      })
      .catch((error: unknown) => {
        appLog.warn('moderation', 'block failed', { error });
        showToast(t('common.error'), 'error');
      });
  };
  deps.alert(t('block.title'), t('block.confirm', { name }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('block.action_short'), style: 'destructive', onPress },
  ]);
}

/** ReportSheet 에 넘길 props — 대상이 있을 때만 시트가 보인다. */
function useReportSheet(deps: Deps): { open: (target: ModerationTarget) => void; props: ReportSheetProps } {
  const [target, setTarget] = useState<ModerationTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const onSubmit = useCallback(
    ({ reason, detail }: { reason: string; detail: string }) => {
      if (!target) return;
      setSubmitting(true);
      void sendReport(deps, target, reason, detail).finally(() => {
        setSubmitting(false);
        setTarget(null);
      });
    },
    [deps, target],
  );
  const onClose = useCallback(() => setTarget(null), []);
  const props = useMemo<ReportSheetProps>(
    () => ({ target: target ? { type: target.type, label: target.label } : null, submitting, onSubmit, onClose }),
    [target, submitting, onSubmit, onClose],
  );
  return { open: setTarget, props };
}

export function useModerationActions(boTable: string, alert: AlertFn = Alert.alert) {
  const qc = useQueryClient();
  const deps = useMemo<Deps>(() => ({ alert, boTable, qc }), [alert, boTable, qc]);
  const sheet = useReportSheet(deps);
  const report = sheet.open;
  const block = useCallback((target: ModerationTarget) => askBlock(deps, target), [deps]);

  /**
   * 작성자/글/댓글 '더보기' 시트 — 소유자 액션(수정·삭제)은 호출자가 앞에 끼운다. 본인 글(`own`)에는 신고·차단을 붙이지
   * 않는다(스스로 차단하면 자기 글이 '차단한 작성자' 안내로 가려진다).
   */
  const openSheet = useCallback(
    (target: ModerationTarget, ownerActions: AlertButton[] = [], own = false) => {
      const moderate: AlertButton[] = own
        ? []
        : [
            { text: t('report.action'), onPress: () => report(target) },
            { text: t('block.action'), style: 'destructive', onPress: () => block(target) },
          ];
      alert(target.label, undefined, [...ownerActions, ...moderate, { text: t('common.cancel'), style: 'cancel' }]);
    },
    [alert, report, block],
  );

  return { report, block, openSheet, reportSheet: sheet.props };
}
