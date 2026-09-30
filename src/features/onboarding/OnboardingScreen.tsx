/**
 * 첫 실행 온보딩 (PLAN T-P1A-12) — 커뮤니티·쇼핑·알림 소개. 첫 장 제목에 `cf_title`(useAppName) 이 들어가고
 * 쇼핑몰이 꺼진 사이트(`shop_enabled === false`)에서는 쇼핑 장을 뺀다. 알림 권한은 여기서 묻지 않는다 —
 * 첫 로그인·첫 주문 뒤에 요청한다(T-P1A-10, PRD NT-01).
 *
 * 표시 조건: AsyncStorage 'onboarding.done' 이 비어 있을 때. 건너뛰기·마지막 장 "시작하기" 모두 완료로 기록한다.
 */
import React, { useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppName } from '../../entities/settings/appName';
import { useSettingsQuery } from '../../entities/settings/queries';
import type { RootStackParamList } from '../../navigation/types';
import { t, useLocale } from '../../shared/i18n';
import { useColors } from '../../shared/ui/tokens/theme';
import { useFrameDimensions } from '../../shared/web/frame';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export interface OnboardingSlide {
  key: 'welcome' | 'shop' | 'notify';
  emoji: string;
  title: string;
  body: string;
  bg: string;
}

const STORAGE_KEY = 'onboarding.done';

export async function isOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // 온보딩 통과 자체를 막지 않는다. 다음 실행 때 다시 보일 수는 있다.
  }
}

export function onboardingSlides(appName: string, shopEnabled: boolean): OnboardingSlide[] {
  const slides: OnboardingSlide[] = [
    {
      key: 'welcome',
      emoji: '💬',
      title: t('onboarding.welcome_title', { app: appName }),
      body: t('onboarding.welcome_body'),
      bg: '#ffdad4',
    },
    { key: 'shop', emoji: '🛍️', title: t('onboarding.shop_title'), body: t('onboarding.shop_body'), bg: '#bddefe' },
    {
      key: 'notify',
      emoji: '🔔',
      title: t('onboarding.notify_title'),
      body: t('onboarding.notify_body'),
      bg: '#94d2c0',
    },
  ];
  return shopEnabled ? slides : slides.filter((slide) => slide.key !== 'shop');
}

function SlideView({ slide, width }: { slide: OnboardingSlide; width: number }) {
  const colors = useColors();
  return (
    <View style={[s.slide, { width }]} testID={`onboarding-slide-${slide.key}`}>
      <View style={[s.iconBubble, { backgroundColor: slide.bg }]}>
        <Text style={s.emoji}>{slide.emoji}</Text>
      </View>
      <Text style={[s.title, { color: colors.onSurface }]}>{slide.title}</Text>
      <Text style={[s.body, { color: colors.onSurfaceVariant }]}>{slide.body}</Text>
    </View>
  );
}

function Dots({ count, index }: { count: number; index: number }) {
  const colors = useColors();
  return (
    <View style={s.dots}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            { backgroundColor: i === index ? colors.primary : colors.outlineVariant, width: i === index ? 20 : 6 },
          ]}
        />
      ))}
    </View>
  );
}

function SkipBar({ top, onSkip }: { top: number; onSkip(): void }) {
  const colors = useColors();
  return (
    <View style={[s.skipRow, { paddingTop: top + 8 }]}>
      <View style={s.spacer} />
      <TouchableOpacity
        accessibilityRole="button"
        testID="onboarding-skip"
        onPress={onSkip}
        hitSlop={12}
        accessibilityLabel={t('onboarding.skip_a11y')}
      >
        <Text style={[s.skip, { color: colors.outline }]}>{t('onboarding.skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function NextButton({ bottom, isLast, onPress }: { bottom: number; isLast: boolean; onPress(): void }) {
  const colors = useColors();
  return (
    <View style={[s.cta, { paddingBottom: bottom + 24 }]}>
      <TouchableOpacity
        testID="onboarding-next"
        onPress={onPress}
        style={[s.button, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Text style={[s.buttonText, { color: colors.onPrimary }]}>
          {t(isLast ? 'onboarding.start' : 'onboarding.next')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function OnboardingScreen({ navigation }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useFrameDimensions();
  useLocale(); // 로케일이 바뀌면 다시 그려 문구를 새 언어로 만든다.
  const slides = onboardingSlides(useAppName(), useSettingsQuery().data?.shop_enabled !== false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const isLast = index >= slides.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };
  const finish = async () => {
    await markOnboardingDone();
    navigation.replace('MainTabs', undefined);
  };
  const next = () => {
    if (isLast) return void finish();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SkipBar top={insets.top} onSkip={() => void finish()} />
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => <SlideView slide={item} width={width} />}
      />
      <Dots count={slides.length} index={index} />
      <NextButton bottom={insets.bottom} isLast={isLast} onPress={next} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  skipRow: { flexDirection: 'row', paddingHorizontal: 20 },
  spacer: { flex: 1 },
  skip: { fontSize: 14, fontWeight: '600' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 24 },
  iconBubble: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 26, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { height: 6, borderRadius: 3 },
  cta: { paddingHorizontal: 24 },
  button: { paddingVertical: 16, borderRadius: 28, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
