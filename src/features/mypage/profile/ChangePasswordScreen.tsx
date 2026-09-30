/**
 * 비밀번호 변경 (PLAN T-P1A-08, PRD MB-09 / AUTH-10) — 현재·새·확인. 서버는 성공하면 이 회원의 모든 refresh token 을
 * 폐기하므로(이 기기 포함), 바로 새 비밀번호로 다시 로그인해 이 기기의 세션을 이어 간다. 다시 로그인이 실패하면
 * 비밀번호는 바뀌었으니 새 비밀번호로 로그인하라고 안내한다.
 */
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { changeMyPassword } from '../../../entities/member/profile';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { passwordPolicyError } from '../../../shared/lib/passwordPolicy';
import { INPUT_LIMITS, clampText } from '../../../shared/lib/textLimits';
import { FormErrorNotice, PrimaryButton, SocialField, SocialFormFrame } from '../../../shared/ui/form/FormParts';
import { useSubmitState } from '../../../shared/ui/form/useSubmitState';
import { useColors } from '../../../shared/ui/tokens/theme';
import { profileErrorMessage } from './profileModel';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;
type Done = 'ok' | 'relogin' | null;

function useChangePassword() {
  const { state, login } = useAuth();
  const submit = useSubmitState(profileErrorMessage);
  const [done, setDone] = useState<Done>(null);
  const mbId = state.member?.mb_id ?? '';
  const change = (current: string, next: string, confirm: string) => {
    if (!current || !next || !confirm) return submit.fail(t('password.input_required'));
    if (next !== confirm) return submit.fail(t('auth.password_mismatch_msg'));
    const invalid = passwordPolicyError(next, mbId);
    if (invalid) return submit.fail(t(invalid));
    void submit.run(async () => {
      await changeMyPassword({ current, next, confirm });
      try {
        await login({ mb_id: mbId, mb_password: next });
        setDone('ok');
      } catch {
        setDone('relogin');
      }
    });
  };
  return { submit, done, change };
}

function PasswordDone({ done, onFinish }: { done: Exclude<Done, null>; onFinish(): void }) {
  const colors = useColors();
  return (
    <>
      <Text testID="password-done" style={[s.done, { color: colors.onSurface }]}>
        {t(done === 'ok' ? 'password.done' : 'password.relogin_failed')}
      </Text>
      <PrimaryButton
        testID="password-finish"
        label={t(done === 'ok' ? 'common.confirm' : 'auth.go_login')}
        busy={false}
        onPress={onFinish}
      />
    </>
  );
}

export function ChangePasswordScreen({ navigation }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { submit, done, change } = useChangePassword();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const limit = (setter: (v: string) => void) => (v: string) => setter(clampText(v, INPUT_LIMITS.signupPassword));

  return (
    <SocialFormFrame title={t('password.title')} heading={t('password.heading')} sub={t('password.sub')} onBack={back}>
      {done ? (
        <PasswordDone done={done} onFinish={() => (done === 'ok' ? back() : navigation.replace('Login'))} />
      ) : (
        <>
          {submit.message ? <FormErrorNotice message={submit.message} /> : null}
          <SocialField
            testID="password-current"
            label={t('password.current_label')}
            value={current}
            onChangeText={limit(setCurrent)}
            secureTextEntry
            autoComplete="current-password"
          />
          <SocialField
            testID="password-new"
            label={t('password.new_label')}
            value={next}
            onChangeText={limit(setNext)}
            secureTextEntry
            autoComplete="new-password"
          />
          <SocialField
            testID="password-confirm"
            label={t('password.confirm_label')}
            value={confirm}
            onChangeText={limit(setConfirm)}
            secureTextEntry
            autoComplete="new-password"
          />
          <PrimaryButton
            testID="password-submit"
            label={t('password.submit')}
            busy={submit.busy}
            onPress={() => change(current, next, confirm)}
          />
        </>
      )}
    </SocialFormFrame>
  );
}

const s = StyleSheet.create({
  done: { fontSize: 15, lineHeight: 22 },
});
