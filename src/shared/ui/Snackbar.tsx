/**
 * Snackbar — undo 액션이 있는 비차단 메시지.
 *
 * 사용:
 *   await showSnackbar({
 *     message: '알림이 삭제되었어요',
 *     actionLabel: '실행 취소',
 *     timeoutMs: 5000,
 *   });  // → boolean — 사용자가 실행 취소 누르면 true
 *
 * UX 패턴:
 *   - 삭제 같은 destructive 액션 직후 즉시 표시
 *   - 5초간 표시되며 사용자가 "실행 취소" 누르면 호출자가 복원 처리
 *   - 시간 만료 또는 다음 Snackbar 발생 시 자동 사라짐
 *
 * 차이점 vs Toast (components/Toast.tsx):
 *   - Toast: 정보 알림 (자동 사라짐, 액션 없음)
 *   - Snackbar: 액션 가능 (undo / 재시도 등), Promise 반환
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './tokens/theme';

interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  timeoutMs?: number;
}

interface SnackbarState extends Required<SnackbarOptions> {
  id: number;
  resolve: (acted: boolean) => void;
}

let pushFn: ((o: SnackbarOptions) => Promise<boolean>) | null = null;
let snackbarSeq = 0;

/**
 * Snackbar 표시. actionLabel 이 있으면 그 버튼을 누른 경우 true 반환.
 * actionLabel 누락 / timeout / 다른 Snackbar 로 교체 → false 반환.
 */
export function showSnackbar(options: SnackbarOptions): Promise<boolean> {
  if (!pushFn) return Promise.resolve(false);
  return pushFn(options);
}

export function SnackbarHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SnackbarState | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<SnackbarState | null>(null);

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
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pushFn = (options) =>
      new Promise((resolve) => {
        // 이전 snackbar 가 살아있으면 false 로 종료
        setState((prev) => {
          if (prev) prev.resolve(false);
          return {
            id: ++snackbarSeq,
            message: options.message,
            actionLabel: options.actionLabel ?? '',
            timeoutMs: options.timeoutMs ?? 5000,
            resolve,
          };
        });
      });
    return () => {
      pushFn = null;
      clearTimers();
      stateRef.current?.resolve(false);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    clearTimers();
    opacity.value = withTiming(1, { duration: 180 });
    translateY.value = withTiming(0, { duration: 220 });
    dismissTimerRef.current = setTimeout(() => {
      // 시간 만료 — false (액션 없음) 로 resolve
      state.resolve(false);
      opacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(20, { duration: 220 });
      removeTimerRef.current = setTimeout(() => setState((curr) => (curr?.id === state.id ? null : curr)), 240);
    }, state.timeoutMs);
    return clearTimers;
  }, [state?.id, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!state) return null;

  const onAction = () => {
    clearTimers();
    state.resolve(true);
    opacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(20, { duration: 180 });
    removeTimerRef.current = setTimeout(() => setState((curr) => (curr?.id === state.id ? null : curr)), 200);
  };

  return (
    <Animated.View
      style={[s.wrap, { bottom: insets.bottom + 80 }, animatedStyle]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={state.message}
    >
      <View style={[s.bubble, { backgroundColor: colors.onSurface }]}>
        <Text style={s.msg} numberOfLines={2}>
          {state.message}
        </Text>
        {state.actionLabel ? (
          <TouchableOpacity accessibilityRole="button" onPress={onAction} hitSlop={8}>
            <Text style={[s.action, { color: colors.primary }]}>{state.actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 998,
    elevation: 998,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
    minHeight: 48,
  },
  msg: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
  action: { fontSize: 14, fontWeight: '700' },
});
