/**
 * 강제 업데이트 게이트.
 *
 * 앱 트리 최상단에 감싸 두면 부팅 시 /v1/settings 의 버전 정책을 평가해서
 *  - 'force' → 자식 트리를 통째로 가리고 dismiss 불가 모달 표시 (스토어 직링크만 가능)
 *  - 'soft'  → 한 번만 묻는 prompt (sessionFlag 로 중복 차단), 자식 트리는 정상 노출
 *  - 'ok'    → pass-through
 *
 * 네트워크/파싱 실패 시엔 fail-open — 서버 장애로 사용자를 막아두지 않는다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPublicSettings } from '../../entities/settings/api';
import {
  compareVersions,
  getCurrentAppVersion,
  pickStoreUrl,
  resolveVersionDecision,
  type VersionDecision,
  type VersionPolicy,
} from '../../shared/lib/versionPolicy';
import { appLog } from '../../shared/lib/debug/appLog';
import { useColors } from '../../shared/ui/tokens/theme';
import { t } from '../../shared/i18n';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../config/appIds';

interface Props {
  children: React.ReactNode;
}

const FALLBACK_STORE_URL = {
  android: PLAY_STORE_URL,
  ios: (APP_STORE_URL || null) as string | null,
};

export function ForceUpdateGate({ children }: Props) {
  const colors = useColors();
  const [decision, setDecision] = useState<VersionDecision>('ok');
  const [policy, setPolicy] = useState<VersionPolicy | null>(null);
  const softShown = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getPublicSettings();
        const current = getCurrentAppVersion();
        const nextPolicy: VersionPolicy = {
          minVersion: (settings.app_min_version ?? '0.0.0').trim() || '0.0.0',
          latestVersion: (settings.app_latest_version ?? '0.0.0').trim() || '0.0.0',
          storeUrl:
            pickStoreUrl(settings.app_store_url_android, settings.app_store_url_ios) ??
            (Platform.OS === 'android' ? FALLBACK_STORE_URL.android : FALLBACK_STORE_URL.ios),
          forceMessage: (settings.app_force_update_message ?? '').trim(),
        };
        const next = resolveVersionDecision(current, nextPolicy);
        if (cancelled) return;

        appLog.info(
          'version-policy',
          `current=${current} min=${nextPolicy.minVersion} latest=${nextPolicy.latestVersion} → ${next}`,
        );
        setPolicy(nextPolicy);
        setDecision(next);

        // soft 는 모달 안 띄우고 Alert 1회로 권장.
        if (next === 'soft' && !softShown.current) {
          softShown.current = true;
          Alert.alert(t('soft_update.title'), t('soft_update.message', { version: nextPolicy.latestVersion }), [
            { text: t('soft_update.button_later'), style: 'cancel' },
            { text: t('soft_update.button_update'), onPress: () => openStore(nextPolicy.storeUrl) },
          ]);
        }
      } catch (e) {
        // 네트워크 실패 → fail-open. 사용자는 막히지 않고 앱을 계속 쓰게 둠.
        appLog.warn('version-policy', 'failed to fetch settings', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (decision === 'force' && policy) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.card, { backgroundColor: colors.surfaceContainerLowest }]}>
          <Text style={s.icon}>⚠️</Text>
          <Text style={[s.title, { color: colors.onSurface }]}>{t('force_update.title')}</Text>
          <Text style={[s.message, { color: colors.onSurfaceVariant }]}>
            {policy.forceMessage || t('force_update.default_message')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={[s.button, { backgroundColor: colors.primary }]}
            onPress={() => openStore(policy.storeUrl)}
            activeOpacity={0.85}
          >
            <Text style={[s.buttonText, { color: colors.onPrimary }]}>{t('force_update.button')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

function openStore(url: string | null) {
  if (!url) {
    Alert.alert(t('force_update.title'), t('force_update.no_store_url'));
    return;
  }
  Linking.openURL(url).catch(() => {
    Alert.alert(t('force_update.title'), t('force_update.no_store_url'));
  });
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  icon: { fontSize: 44 },
  title: { fontSize: 20, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: { fontWeight: '700', fontSize: 15 },
});

export { compareVersions };
