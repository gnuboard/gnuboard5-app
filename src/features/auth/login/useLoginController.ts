/**
 * 로그인 제출 컨트롤러 (PLAN T-P1A-03/04) — 아이디/비밀번호·소셜 로그인의 중복 제출 방지, 실패 분류, 성공 후 이동.
 * 소셜 로그인이 미연동 프로필로 끝나면 가입·연결 화면으로 보낸다(onSocialSignup).
 */
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useAuth } from '../../../entities/session/AuthContext';
import type { SignInProvider } from '../../../entities/session/socialLogin';
import { t } from '../../../shared/i18n';
import { socialErrorMessage } from '../social/socialErrors';
import { buildDeviceLabel, classifyLoginError, type LoginFailure } from './loginModel';

export type LoginBusy = 'password' | SignInProvider | null;

export interface LoginController {
  failure: LoginFailure | null;
  busy: LoginBusy;
  submitPassword(mbId: string, password: string): Promise<void>;
  submitSocial(provider: SignInProvider): Promise<void>;
  clearFailure(): void;
}

/** 사용자가 브라우저를 닫은 취소는 안내하지 않는다. */
function socialFailure(error: unknown): LoginFailure | null {
  const message = socialErrorMessage(error);
  return message === null ? null : { kind: 'unknown', message };
}

export interface LoginCallbacks {
  onSuccess(): void;
  /** 미연동 소셜 프로필 — 진행 중 가입은 socialSignup 저장소에 있다. */
  onSocialSignup(): void;
}

type Completion = 'member' | 'signup';

function currentDeviceLabel(): string {
  return buildDeviceLabel(Device.modelName, Platform.OS, Platform.Version);
}

export function useLoginController({ onSuccess, onSocialSignup }: LoginCallbacks): LoginController {
  const { login, social } = useAuth();
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [busy, setBusy] = useState<LoginBusy>(null);
  const busyRef = useRef(false);

  const run = useCallback(
    async (
      kind: Exclude<LoginBusy, null>,
      task: () => Promise<Completion>,
      toFailure: (e: unknown) => LoginFailure | null,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(kind);
      setFailure(null);
      try {
        if ((await task()) === 'signup') onSocialSignup();
        else onSuccess();
      } catch (error: unknown) {
        setFailure(toFailure(error));
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [onSuccess, onSocialSignup],
  );

  const submitPassword = useCallback(
    async (mbId: string, password: string) => {
      const id = mbId.trim();
      if (!id || !password) {
        setFailure({ kind: 'unknown', message: t('auth.login_input_required') });
        return;
      }
      const input = { mb_id: id, mb_password: password, device_label: currentDeviceLabel(), auto_login: true };
      await run('password', async () => (await login(input), 'member'), classifyLoginError);
    },
    [login, run],
  );

  const submitSocial = useCallback(
    (provider: SignInProvider) =>
      run(provider, async () => ((await social(provider)).kind === 'signup' ? 'signup' : 'member'), socialFailure),
    [run, social],
  );

  const clearFailure = useCallback(() => setFailure(null), []);
  return { failure, busy, submitPassword, submitSocial, clearFailure };
}
