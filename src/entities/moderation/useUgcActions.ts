/**
 * UGC(리뷰·상품문의·쪽지·투표의견) 공용 동작 (PLAN T-P2-02/03/05) — 신고 사유 선택 → 1:1 문의 '신고'(회원 전용, 게스트는 로그인),
 * 작성자 숨기기(확인 후 로컬 차단 목록). 대상 식별자는 호출자가 ReportTarget 으로 넘긴다.
 */
import { Alert } from 'react-native';
import { useBlockAuthor, type AuthorRef } from './localBlockList';
import { reportViaQa, type ReportTarget } from './reportViaQa';
import { t } from '../../shared/i18n';
import { errorMessage } from '../../shared/lib/errors';
import { showToast } from '../../shared/ui/Toast';

export const REPORT_REASONS = ['spam', 'abuse', 'privacy', 'other'] as const;

export function useUgcActions(isMember: boolean, onLogin: () => void) {
  const block = useBlockAuthor();
  const report = (target: ReportTarget) => {
    if (!isMember) return onLogin();
    const send = (reason: string) =>
      reportViaQa(target, t(`ugc.reason_${reason}`))
        .then(() => showToast(t('ugc.reported'), 'success'))
        .catch((error: unknown) => showToast(errorMessage(error, t('ugc.report_failed')), 'error'));
    Alert.alert(t('ugc.report_title'), t('ugc.report_body'), [
      ...REPORT_REASONS.map((reason) => ({ text: t(`ugc.reason_${reason}`), onPress: () => void send(reason) })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };
  const hide = (author: AuthorRef) =>
    Alert.alert(t('ugc.block_title', { name: author.name ?? '' }), t('ugc.block_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('ugc.block'), style: 'destructive', onPress: () => block.mutate(author) },
    ]);
  return { report, hide };
}
