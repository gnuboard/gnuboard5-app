/**
 * 스택 화면 아래 여백(edge-to-edge 시스템 내비게이션 바) — 탭·온보딩은 스스로 비우므로 그대로, 나머지는 bottom inset.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StackScreenLayout } from '../navigation/StackScreenLayout';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 48 } };

async function renderFor(name: string) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <StackScreenLayout route={{ name }}>
        <Text>body</Text>
      </StackScreenLayout>
    </SafeAreaProvider>,
  );
}

test('stack screens get the bottom system-bar inset', async () => {
  await renderFor('PostList');
  expect(screen.getByTestId('stack-screen-bottom-inset')).toBeTruthy();
  expect(screen.getByText('body')).toBeTruthy();
});

test('tabs and onboarding already inset themselves', async () => {
  await renderFor('MainTabs');
  expect(screen.queryByTestId('stack-screen-bottom-inset')).toBeNull();
  await renderFor('Onboarding');
  expect(screen.queryByTestId('stack-screen-bottom-inset')).toBeNull();
});
