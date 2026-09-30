// AsyncStorage mock — 모든 테스트가 자동으로 in-memory 백엔드 사용.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// 업로드용 fetch(실기기는 RN XHR)는 테스트에서 전역 fetch 로 — msw 가 가로챈다. 전송 선택 자체는 fetchWithTimeoutUpload.test.ts.
jest.mock('./src/shared/api/uploadFetch', () => ({ uploadFetch: (input, init) => globalThis.fetch(input, init) }));

// react-native-keyboard-controller 공식 목(네이티브 모듈 없이 KeyboardProvider·KeyboardAvoidingView 가 View 로 렌더).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    __reset: () => store.clear(),
  };
});

// Reanimated 4: worklets 는 package.json jest.resolver(react-native-worklets/jest/resolver.js)가 JS 구현으로 해석한다.
require('react-native-reanimated').setUpTests();
