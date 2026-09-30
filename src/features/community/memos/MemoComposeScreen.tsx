/**
 * 쪽지 쓰기 (PLAN T-P2-04) — 받는 회원 아이디(답장이면 채움)·내용(최대 1000자). 로컬 차단 목록에 있는 회원에게는 보내지
 * 않는다(서버 차단 없음 — SC-10 보류). 서버 오류(자기 자신·비공개 회원·없는 회원·포인트 부족)는 메시지 그대로.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { MEMO_MAX_LENGTH, memoKeys, sendMemo } from '../../../entities/memo/api';
import { isBlockedAuthor, listBlockedAuthors } from '../../../entities/moderation/localBlockList';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { Button } from '../../../shared/ui/Button';
import { Field } from '../../../shared/ui/Field';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'MemoCompose'>;

const MB_ID = /^[A-Za-z0-9_]{3,20}$/;

function useSendMemo(navigation: Props['navigation']) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const send = async (to: string, text: string) => {
    const recipient = to.trim();
    if (!MB_ID.test(recipient)) return showToast(t('memo.err_recipient'), 'error');
    if (!text.trim()) return showToast(t('memo.err_text'), 'error');
    if (isBlockedAuthor(await listBlockedAuthors(), { mbId: recipient })) {
      return showToast(t('memo.err_hidden_recipient'), 'error');
    }
    setBusy(true);
    try {
      await sendMemo(recipient, text.trim());
      await qc.invalidateQueries({ queryKey: memoKeys.root });
      showToast(t('memo.sent'), 'success');
      navigation.goBack();
    } catch (error) {
      showToast(errorMessage(error, t('memo.failed')), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}

export function MemoComposeScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const [to, setTo] = useState(route.params?.to ?? '');
  const [text, setText] = useState('');
  const { send, busy } = useSendMemo(navigation);
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('memo.write')} leftIcon="←" onLeftPress={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label={t('memo.recipient')}
          value={to}
          onChangeText={setTo}
          autoCapitalize="none"
          maxLength={20}
          testID="memo-to"
        />
        <Field
          label={t('memo.text')}
          value={text}
          onChangeText={setText}
          maxLength={MEMO_MAX_LENGTH}
          multiline
          testID="memo-text"
        />
        <Button
          label={t('memo.send')}
          onPress={() => void send(to, text)}
          loading={busy}
          disabled={busy}
          testID="memo-send"
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3] },
});
