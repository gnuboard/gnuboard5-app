/**
 * OS 언어 감지 (Android) — New Architecture 에서는 `NativeModules.I18nManager` 가 비어 있어 한국어 기기에서도 영어로
 * 뜨던 회귀(2026-09-26 Maestro 실측). 공개 API `I18nManager.getConstants()` 를 먼저 읽는다.
 */
type RN = typeof import('react-native');

/** 격리된 모듈 레지스트리에서 react-native 를 조작한 뒤 i18n 을 새로 읽는다(감지는 import 시점 1회). */
function loadT(localeIdentifier: string): (key: string) => string {
  let t: (key: string) => string = () => '';
  jest.isolateModules(() => {
    const rn = jest.requireActual<RN>('react-native');
    jest.replaceProperty(rn.Platform, 'OS', 'android');
    jest.replaceProperty(rn.NativeModules, 'I18nManager', undefined);
    jest
      .spyOn(rn.I18nManager, 'getConstants')
      .mockReturnValue({ isRTL: false, doLeftAndRightSwapInRTL: true, localeIdentifier });
    t = (jest.requireActual('../shared/i18n') as { t: (key: string) => string }).t;
  });
  return t;
}

afterEach(() => jest.restoreAllMocks());

test('Android reads the locale from I18nManager.getConstants even when NativeModules.I18nManager is missing', () => {
  expect(loadT('ko_KR')('common.save')).toBe('저장');
});

test('Android falls back to English for other locales', () => {
  expect(loadT('en_US')('common.save')).not.toBe('저장');
});
