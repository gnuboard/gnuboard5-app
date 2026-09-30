/**
 * 키보드가 입력칸을 가리지 않게 하는 화면 틀.
 *
 * Expo SDK 57 은 Android 에서 edge-to-edge 가 강제라 `windowSoftInputMode=adjustResize` 로는 창이 줄지 않는다. 그래서
 * RN 의 `KeyboardAvoidingView`(예전처럼 iOS 에만 padding)로는 Android 키보드가 아래 입력칸(가입 캡차 등)을 덮었다.
 * react-native-keyboard-controller 의 KeyboardAvoidingView 는 두 플랫폼 모두 키보드 높이만큼 화면을 줄이고, 줄어든
 * ScrollView 는 포커스된 입력칸을 스스로 보이는 곳까지 올린다. 입력칸이 있는 화면·시트는 RN 것 대신 이것을 쓴다
 * (lint 가 react-native 의 KeyboardAvoidingView 를 막는다).
 */
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface Props {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

export function KeyboardScreen({ style, testID, children }: Props) {
  return (
    <KeyboardAvoidingView behavior="padding" style={style} testID={testID}>
      {children}
    </KeyboardAvoidingView>
  );
}
