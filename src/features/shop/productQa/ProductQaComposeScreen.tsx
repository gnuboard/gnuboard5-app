/**
 * 상품문의 쓰기/고치기 (PLAN T-P2-03) — 제목·내용(일반 텍스트)·비밀글. 수정은 답변 전만(서버 409 → 안내).
 * 연락처(이메일·휴대폰)는 서버가 회원 정보로 채운다.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { createProductQa, productQaKeys, updateProductQa, type ProductQaInput } from '../../../entities/productQa/api';
import type { RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Field } from '../../../shared/ui/Field';
import { AgreeRow } from '../../../shared/ui/form/FormParts';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { htmlToPlainText } from '../reviews/ReviewComposeScreen';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductQaCompose'>;

export function productQaErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return t('product_qa.answered_locked');
  return errorMessage(error, t('product_qa.save_failed'));
}

function useSubmitQa(props: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { itId, qa } = props.route.params;
  const submit = async (input: ProductQaInput) => {
    if (!input.subject.trim()) return showToast(t('product_qa.err_subject'), 'error');
    if (!input.question.trim()) return showToast(t('product_qa.err_question'), 'error');
    setBusy(true);
    try {
      const clean = { ...input, subject: input.subject.trim(), question: input.question.trim() };
      if (qa) await updateProductQa(qa.iqId, clean);
      else await createProductQa(itId, clean);
      await qc.invalidateQueries({ queryKey: productQaKeys.root });
      showToast(t(qa ? 'product_qa.updated' : 'product_qa.submitted'), 'success');
      props.navigation.goBack();
    } catch (error) {
      showToast(productQaErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy };
}

export function ProductQaComposeScreen(props: Props) {
  const { colors } = useTheme();
  const { qa, itName } = props.route.params;
  const [subject, setSubject] = useState(qa?.subject ?? '');
  const [question, setQuestion] = useState(() => htmlToPlainText(qa?.question ?? ''));
  const [secret, setSecret] = useState(qa?.secret ?? false);
  const { submit, busy } = useSubmitQa(props);
  const title = t(qa ? 'product_qa.edit_title' : 'product_qa.ask_title');
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={() => props.navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {itName ? <AppText variant="label">{itName}</AppText> : null}
        <Field
          label={t('review.subject')}
          value={subject}
          onChangeText={setSubject}
          maxLength={255}
          testID="qa-subject"
        />
        <Field
          label={t('product_qa.question')}
          value={question}
          onChangeText={setQuestion}
          maxLength={2000}
          multiline
          testID="qa-question"
        />
        <AgreeRow
          testID="qa-secret"
          label={t('product_qa.secret_option')}
          checked={secret}
          onToggle={() => setSecret(!secret)}
        />
        <Button
          label={t('review.submit')}
          onPress={() => void submit({ subject, question, secret })}
          loading={busy}
          disabled={busy}
          testID="qa-submit"
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3] },
});
