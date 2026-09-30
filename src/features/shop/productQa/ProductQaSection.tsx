/**
 * 상품 상세 문의 탭 (PLAN T-P2-03, PRD SH-06) — `ugc_product_qa` 플래그가 켜진 1.1 에서만 탭이 보인다.
 *  - 비밀글은 서버가 가린 그대로 '비밀글' 로만 보이고 신고·숨기기 대상이 아니다(내용이 없음).
 *  - 답변 여부 배지, 답변 본문(판매자). 신고(1:1 문의 '신고' + iq_id)·작성자 숨기기(로컬 차단 목록), 운영자 연락처.
 *  - 문의하기는 회원만(게스트는 로그인).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { isBlockedAuthor, useLocalBlockList } from '../../../entities/moderation/localBlockList';
import { useProductQasQuery, type ProductQa } from '../../../entities/productQa/api';
import { useAuth } from '../../../entities/session/AuthContext';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { RichText } from '../../../shared/html/RichText';
import { t } from '../../../shared/i18n';
import { formatPostTime } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { useUgcActions } from '../../../entities/moderation/useUgcActions';

interface CardProps {
  qa: ProductQa;
  onReport: () => void;
  onHide: () => void;
}

function QaBody({ qa }: { qa: ProductQa }) {
  const { colors } = useTheme();
  if (!qa.can_view) return <AppText variant="bodySm">{t('product_qa.secret_subject')}</AppText>;
  return (
    <>
      <AppText variant="bodySm">{qa.iq_subject}</AppText>
      {qa.iq_question ? (
        <RichText html={qa.iq_question} maxChars={300} testID={`product-qa-question-${qa.iq_id}`} />
      ) : null}
      {qa.iq_answer ? (
        <View style={[styles.answer, { backgroundColor: colors.surfaceContainer }]}>
          <AppText variant="caption" tone="primaryStrong">
            {t('product_qa.answer')}
          </AppText>
          <RichText html={qa.iq_answer} maxChars={0} testID={`product-qa-answer-${qa.iq_id}`} />
        </View>
      ) : null}
    </>
  );
}

function QaCard({ qa, onReport, onHide }: CardProps) {
  const { colors } = useTheme();
  const status = t(qa.is_answered ? 'product_qa.answered' : 'product_qa.waiting');
  return (
    <View style={[styles.card, { borderColor: colors.outlineSubtle }]} testID={`product-qa-${qa.iq_id}`}>
      <View style={styles.row}>
        <Badge label={status} tone={qa.is_answered ? 'primary' : 'neutral'} />
        {qa.iq_secret ? <Badge label={t('product_qa.secret')} /> : null}
      </View>
      <QaBody qa={qa} />
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${qa.can_view ? qa.iq_name : t('product_qa.private_author')} · ${formatPostTime(qa.iq_time)}`}
      </AppText>
      {qa.can_view ? (
        <View style={styles.row}>
          <Button label={t('ugc.report')} variant="ghost" onPress={onReport} testID={`product-qa-report-${qa.iq_id}`} />
          <Button label={t('ugc.block')} variant="ghost" onPress={onHide} testID={`product-qa-block-${qa.iq_id}`} />
        </View>
      ) : null}
    </View>
  );
}

function OperatorContact() {
  const rows = companyRows(useSettingsQuery().data) ?? [];
  const contact = rows.filter((row) => row.key === 'tel' || row.key === 'email');
  if (!contact.length) return null;
  return (
    <AppText variant="caption" tone="onSurfaceCaption" testID="product-qa-operator-contact">
      {t('review.operator_contact', { contact: contact.map((row) => row.value).join(' · ') })}
    </AppText>
  );
}

export function ProductQaSection({ itId, onAsk, onLogin }: { itId: string; onAsk: () => void; onLogin: () => void }) {
  const isMember = !!useAuth().state.member;
  const qas = useProductQasQuery(itId);
  const blocked = useLocalBlockList().data ?? [];
  const actions = useUgcActions(isMember, onLogin);
  const rows = (qas.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (qa) => !qa.can_view || !isBlockedAuthor(blocked, { mbId: qa.mb_id, name: qa.iq_name }),
  );
  const emptyKey = qas.isError ? 'product_qa.load_failed' : 'product_qa.empty';
  return (
    <View style={styles.section} testID="product-qas">
      <Button
        label={t('product_qa.ask')}
        variant="secondary"
        onPress={isMember ? onAsk : onLogin}
        testID="product-qa-ask"
      />
      {qas.isPending ? <Skeleton height={80} /> : null}
      {!qas.isPending && !rows.length ? (
        <AppText tone="onSurfaceCaption" testID="product-qas-empty">
          {t(emptyKey)}
        </AppText>
      ) : null}
      {rows.map((qa) => (
        <QaCard
          key={qa.iq_id}
          qa={qa}
          onReport={() => actions.report({ kind: 'product_qa', iqId: qa.iq_id, itId: qa.it_id })}
          onHide={() => actions.hide({ mbId: qa.mb_id, name: qa.iq_name })}
        />
      ))}
      {qas.hasNextPage ? (
        <Button
          label={t('product_qa.more')}
          variant="ghost"
          onPress={() => void qas.fetchNextPage()}
          loading={qas.isFetchingNextPage}
          testID="product-qas-more"
        />
      ) : null}
      <OperatorContact />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE[3], padding: SPACE[4] },
  card: { borderWidth: 1, borderRadius: RADII.md, padding: SPACE[3], gap: SPACE[1] },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE[2] },
  answer: { borderRadius: RADII.sm, padding: SPACE[2], gap: SPACE[1] },
});
