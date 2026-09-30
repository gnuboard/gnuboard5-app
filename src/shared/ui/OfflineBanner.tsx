/**
 * 네트워크 오프라인 시 상단에 슬라이드 인. 모양은 Claude Design v2 — 화면 위쪽에 뜬 연한 호박색 카드(와이파이 끊김 아이콘
 * + '마지막으로 받은 내용을 보여드려요'). 캐시된 화면은 그대로 두고 알리기만 한다.
 * Reanimated FadeInUp / FadeOutUp — 부드러운 entrance.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import NetInfo from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { isOfflineNetworkState } from '../lib/netInfo';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { ELEVATION, RADII, SPACE } from './tokens/primitive';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(isOfflineNetworkState(state));
    });
    return unsub;
  }, []);

  if (!offline) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[s.wrap, { top: insets.top + SPACE[2] }]}
      pointerEvents="none"
    >
      <View
        style={[s.card, ELEVATION.standard, { backgroundColor: colors.warningContainer }]}
        accessible
        accessibilityRole="alert"
        accessibilityLabel={t('offline.banner')}
        testID="offline-banner"
      >
        <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
        <AppText variant="bodySm" weight="600" style={[s.text, { color: colors.onWarningContainer }]}>
          {t('offline.banner')}
        </AppText>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: SPACE[4], right: SPACE[4], zIndex: 1000, elevation: 1000 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderRadius: RADII.md,
  },
  text: { flex: 1 },
});
