/**
 * 오픈소스 고지 데이터 (PLAN T-P1A-12, PRD MB-13 / RELEASE-CHECKLIST). package.json 의 런타임 의존성 기준이며,
 * 버전은 배포마다 바뀌므로 적지 않는다(이름·라이선스·저작권만). 의존성을 추가·삭제하면 이 목록도 함께 고친다.
 * Pretendard 는 SIL OFL 1.1 — 전문은 앱에 함께 담긴 `assets/fonts/Pretendard-LICENSE.txt` 이며 아래 고지는 요약이다.
 */
export interface LicenseEntry {
  name: string;
  license: string;
  copyright?: string;
  url?: string;
}

export const FONT_LICENSE: LicenseEntry = {
  name: 'Pretendard',
  license: 'SIL Open Font License 1.1',
  copyright: 'Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard.',
  url: 'https://github.com/orioncactus/pretendard',
};

export const FONT_LICENSE_NOTICE =
  'This Font Software is licensed under the SIL Open Font License, Version 1.1. ' +
  'The full license text ships with the app (assets/fonts/Pretendard-LICENSE.txt) and is also available at ' +
  'https://scripts.sil.org/OFL.';

export const MIT_NOTICE =
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and ' +
  'associated documentation files (the "Software"), to deal in the Software without restriction. ' +
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.';

/** 런타임 의존성 — 2026-09-22 기준 전부 MIT. */
export const LIBRARY_LICENSES: readonly LicenseEntry[] = [
  { name: '@expo/metro-runtime', license: 'MIT' },
  { name: '@expo/vector-icons', license: 'MIT' },
  { name: '@react-native-async-storage/async-storage', license: 'MIT' },
  { name: '@react-native-community/netinfo', license: 'MIT' },
  { name: '@react-navigation/bottom-tabs', license: 'MIT' },
  { name: '@react-navigation/native', license: 'MIT' },
  { name: '@react-navigation/native-stack', license: 'MIT' },
  { name: '@sentry/react-native', license: 'MIT' },
  { name: '@shopify/flash-list', license: 'MIT' },
  { name: '@tanstack/query-async-storage-persister', license: 'MIT' },
  { name: '@tanstack/react-query', license: 'MIT' },
  { name: '@tanstack/react-query-persist-client', license: 'MIT' },
  { name: 'expo', license: 'MIT' },
  { name: 'expo-apple-authentication', license: 'MIT' },
  { name: 'expo-application', license: 'MIT' },
  { name: 'expo-asset', license: 'MIT' },
  { name: 'expo-audio', license: 'MIT' },
  { name: 'expo-constants', license: 'MIT' },
  { name: 'expo-crypto', license: 'MIT' },
  { name: 'expo-device', license: 'MIT' },
  { name: 'expo-file-system', license: 'MIT' },
  { name: 'expo-font', license: 'MIT' },
  { name: 'expo-image-manipulator', license: 'MIT' },
  { name: 'expo-image-picker', license: 'MIT' },
  { name: 'expo-linking', license: 'MIT' },
  { name: 'expo-notifications', license: 'MIT' },
  { name: 'expo-secure-store', license: 'MIT' },
  { name: 'expo-sharing', license: 'MIT' },
  { name: 'expo-splash-screen', license: 'MIT' },
  { name: 'expo-status-bar', license: 'MIT' },
  { name: 'expo-system-ui', license: 'MIT' },
  { name: 'expo-updates', license: 'MIT' },
  { name: 'expo-web-browser', license: 'MIT' },
  { name: 'htmlparser2', license: 'MIT' },
  { name: 'react', license: 'MIT' },
  { name: 'react-dom', license: 'MIT' },
  { name: 'react-native', license: 'MIT' },
  { name: 'react-native-keyboard-controller', license: 'MIT' },
  { name: 'react-native-reanimated', license: 'MIT' },
  { name: 'react-native-safe-area-context', license: 'MIT' },
  { name: 'react-native-screens', license: 'MIT' },
  { name: 'react-native-web', license: 'MIT' },
  { name: 'react-native-webview', license: 'MIT' },
  { name: 'react-native-worklets', license: 'MIT' },
  { name: 'xss', license: 'MIT' },
  { name: 'zod', license: 'MIT' },
];
