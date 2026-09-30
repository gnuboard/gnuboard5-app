/**
 * 가입 본인인증 (SC-21, PRD AUTH-06 · Q-11) — 관리자 설정의 인증 수단(간편인증·휴대폰)마다 버튼을 두고, 본인인증
 * WebView 결과(이름·휴대폰·서명 토큰)를 가입 화면에 돌려준다. 인증을 마치면 이름·휴대폰은 인증값으로 가입된다(서버가
 * 토큰 값으로 저장). 필수 사이트면 인증 전에는 가입할 수 없다(SignupScreen 이 막는다).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { API_BASE } from '../../../shared/api/client';
import { siteOriginFromApiBase } from '../../../shared/api/schemaPrimitives';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { showToast } from '../../../shared/ui/Toast';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { requestIdentityCert } from '../cert/certLaunchChannel';
import { certStartUrl, type CertMethodEntry } from '../cert/identityCert';

export interface VerifiedCert {
  name: string;
  hp: string;
  token: string;
}

interface Props {
  methods: CertMethodEntry[];
  required: boolean;
  cert: VerifiedCert | null;
  onVerified(cert: VerifiedCert | null): void;
}

export function SignupCertSection({ methods, required, cert, onVerified }: Props) {
  const [busy, setBusy] = useState(false);
  if (methods.length === 0) return null;
  const start = async (entry: CertMethodEntry) => {
    setBusy(true);
    try {
      const result = await requestIdentityCert(certStartUrl(siteOriginFromApiBase(API_BASE), entry.path));
      if (result.kind === 'success') onVerified({ name: result.name, hp: result.hp, token: result.token });
      else if (result.kind === 'error') showToast(result.message || t('auth.cert_failed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.section} testID="signup-cert">
      <AppText variant="label">{t('auth.cert_section_title')}</AppText>
      {cert ? (
        <View style={styles.done} testID="signup-cert-done">
          <AppText variant="body" tone="primaryStrong">
            {t('auth.cert_done')}
          </AppText>
          <AppText variant="bodySm" tone="onSurfaceSecondary">
            {t('auth.cert_done_detail', { name: cert.name, hp: cert.hp })}
          </AppText>
          <Button label={t('auth.cert_redo')} variant="ghost" size="compact" onPress={() => onVerified(null)} />
        </View>
      ) : (
        <>
          <AppText variant="bodySm" tone={required ? 'error' : 'onSurfaceSecondary'}>
            {t(required ? 'auth.cert_section_required' : 'auth.cert_section_optional')}
          </AppText>
          <View style={styles.buttons}>
            {methods.map((entry) => (
              <Button
                key={entry.method}
                testID={`signup-cert-${entry.method}`}
                label={t(entry.method === 'simple' ? 'auth.cert_method_simple' : 'auth.cert_method_hp')}
                variant="secondary"
                loading={busy}
                onPress={() => void start(entry)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE[2], marginBottom: SPACE[3] },
  done: { gap: SPACE[1], alignItems: 'flex-start' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE[2] },
});
