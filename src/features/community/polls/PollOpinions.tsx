/**
 * 투표 기타 의견 (PLAN T-P2-05) — `ugc_poll_opinions` 플래그가 켜진 1.1 에서만. 목록(로컬 차단 목록의 작성자 숨김)·
 * 신고(1:1 문의 '신고' + po_id·pc_id, 회원 전용)·작성자 숨기기·내 의견 삭제(`can_delete`)·의견 쓰기(`can_comment` 이고
 * 안내 문구 `po_etc` 가 있을 때만 — 게스트는 이름 입력). 목록 하단에 운영자 연락처.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isBlockedAuthor, useLocalBlockList } from '../../../entities/moderation/localBlockList';
import { useUgcActions } from '../../../entities/moderation/useUgcActions';
import { POLL_OPINION_MAX } from '../../../entities/poll/api';
import { useAddPollOpinion, useDeletePollOpinion } from '../../../entities/poll/queries';
import type { PollDto, PollOpinionDto } from '../../../entities/poll/schema';
import { companyRows } from '../../../entities/settings/company';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Field } from '../../../shared/ui/Field';
import { showToast } from '../../../shared/ui/Toast';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

interface Props {
  poll: PollDto;
  isMember: boolean;
  onLogin: () => void;
}

interface RowProps {
  item: PollOpinionDto;
  actions: ReturnType<typeof useUgcActions>;
  onDelete: () => void;
}

function OpinionRow({ item, actions, onDelete }: RowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.opinion, { borderColor: colors.outlineSubtle }]} testID={`poll-opinion-${item.pc_id}`}>
      <AppText variant="bodySm">{item.pc_idea}</AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {`${item.pc_name} · ${formatServerDate(item.pc_datetime)}`}
      </AppText>
      <View style={styles.actions}>
        <Button
          label={t('ugc.report')}
          variant="ghost"
          onPress={() => actions.report({ kind: 'poll_opinion', poId: item.po_id, pcId: item.pc_id })}
          testID={`poll-opinion-report-${item.pc_id}`}
        />
        <Button
          label={t('ugc.block')}
          variant="ghost"
          onPress={() => actions.hide({ mbId: item.mb_id, name: item.pc_name })}
          testID={`poll-opinion-block-${item.pc_id}`}
        />
        {item.can_delete ? (
          <Button
            label={t('common.delete')}
            variant="ghost"
            onPress={onDelete}
            testID={`poll-opinion-delete-${item.pc_id}`}
          />
        ) : null}
      </View>
    </View>
  );
}

function OpinionComposer({ poll, isMember }: Pick<Props, 'poll' | 'isMember'>) {
  const [idea, setIdea] = useState('');
  const [name, setName] = useState('');
  const add = useAddPollOpinion(poll.po_id);
  const submit = () => {
    if (!idea.trim()) return showToast(t('poll.opinion_err_empty'), 'error');
    if (!isMember && !name.trim()) return showToast(t('poll.opinion_err_name'), 'error');
    add.mutate(
      { idea, name: isMember ? undefined : name },
      {
        onSuccess: () => setIdea(''),
        onError: (error) => showToast(errorMessage(error, t('poll.opinion_failed')), 'error'),
      },
    );
  };
  return (
    <View style={styles.block} testID="poll-opinion-composer">
      <AppText variant="caption" tone="onSurfaceSecondary">
        {poll.po_etc}
      </AppText>
      {isMember ? null : (
        <Field
          label={t('poll.opinion_name')}
          value={name}
          onChangeText={setName}
          maxLength={20}
          testID="poll-opinion-name"
        />
      )}
      <Field
        label={t('poll.opinion')}
        value={idea}
        onChangeText={setIdea}
        maxLength={POLL_OPINION_MAX}
        multiline
        testID="poll-opinion-input"
      />
      <Button
        label={t('poll.opinion_submit')}
        onPress={submit}
        loading={add.isPending}
        disabled={add.isPending}
        testID="poll-opinion-submit"
      />
    </View>
  );
}

function OperatorContact() {
  const rows = companyRows(useSettingsQuery().data) ?? [];
  const contact = rows.filter((row) => row.key === 'tel' || row.key === 'email');
  if (!contact.length) return null;
  return (
    <AppText variant="caption" tone="onSurfaceCaption" testID="poll-operator-contact">
      {t('review.operator_contact', { contact: contact.map((row) => row.value).join(' · ') })}
    </AppText>
  );
}

export function PollOpinions({ poll, isMember, onLogin }: Props) {
  const blocked = useLocalBlockList().data ?? [];
  const actions = useUgcActions(isMember, onLogin);
  const remove = useDeletePollOpinion(poll.po_id);
  const items = poll.etc_comments.filter((item) => !isBlockedAuthor(blocked, { mbId: item.mb_id, name: item.pc_name }));
  const onDelete = (pcId: number) =>
    remove.mutate(pcId, { onError: (error) => showToast(errorMessage(error, t('poll.opinion_failed')), 'error') });
  return (
    <View style={styles.block} testID="poll-opinions">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('poll.opinions')}
      </AppText>
      {poll.can_comment && poll.po_etc ? <OpinionComposer poll={poll} isMember={isMember} /> : null}
      {items.map((item) => (
        <OpinionRow key={item.pc_id} item={item} actions={actions} onDelete={() => onDelete(item.pc_id)} />
      ))}
      <OperatorContact />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACE[2] },
  opinion: { gap: SPACE[1], paddingVertical: SPACE[2], borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
