/**
 * 가벼운 전역 Toast — Alert.alert 대신 비차단 알림용.
 *
 * 사용:
 *   ToastHost 를 App.tsx 최상위 한 번 마운트
 *   어디서나 showToast('저장됨') / showToast('네트워크 오류', 'error')
 *
 * 동작:
 *   - 동시 1개만 표시 (큐 없음)
 *   - 2초 후 자동 닫힘 (errorType 은 3초)
 *   - Reanimated 4 — opacity + translateY 동시 슬라이드 인/아웃
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './tokens/theme';

type ToastKind = 'info' | 'success' | 'error';

interface ToastState {
  msg: string;
  kind: ToastKind;
  id: number;
}

let pushFn: ((msg: string, kind?: ToastKind) => void) | null = null;
let toastSeq = 0;

export function showToast(msg: string, kind: ToastKind = 'info'): void {
  if (pushFn) pushFn(msg, kind);
}

export function ToastHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  };

  useEffect(() => {
    pushFn = (msg, kind = 'info') => {
      setToast({ msg, kind, id: ++toastSeq });
    };
    return () => {
      pushFn = null;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    clearTimers();
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withTiming(0, { duration: 220 });
    const ms = toast.kind === 'error' ? 3000 : 2000;
    const toastId = toast.id;
    dismissTimerRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(20, { duration: 220 });
      // 애니메이션 시간 후 unmount
      removeTimerRef.current = setTimeout(() => {
        setToast((curr) => (curr?.id === toastId ? null : curr));
      }, 240);
    }, ms);
    return clearTimers;
  }, [toast?.id, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast) return null;

  const bg = toast.kind === 'error' ? colors.error : toast.kind === 'success' ? colors.tertiary : colors.onSurface;

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.wrap, { bottom: insets.bottom + 32 }, animatedStyle]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={toast.kind === 'error' ? 'assertive' : 'polite'}
      accessibilityLabel={toast.msg}
    >
      <View style={[s.bubble, { backgroundColor: bg }]}>
        <Text style={s.text}>{toast.msg}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    maxWidth: '85%',
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
