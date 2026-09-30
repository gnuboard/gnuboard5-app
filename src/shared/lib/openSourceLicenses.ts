/**
 * 오픈소스 라이선스 고지 데이터 — 설정 > 오픈소스 라이선스 화면(T-P1A-12)이 렌더한다.
 * 번들 폰트(Pretendard, SIL OFL 1.1)는 고지 의무가 있어 여기 등록한다(PLAN T-P0-09). 전문은 assets/fonts/Pretendard-LICENSE.txt.
 */
export interface OpenSourceLicense {
  name: string;
  version: string;
  license: string;
  copyright: string;
  url: string;
  /** 화면에 그대로 보여줄 짧은 고지문. */
  notice: string;
}

export const OPEN_SOURCE_LICENSES: readonly OpenSourceLicense[] = [
  {
    name: 'Pretendard',
    version: '1.3.9',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2021, Kil Hyung-jin, with Reserved Font Name Pretendard.',
    url: 'https://github.com/orioncactus/pretendard',
    notice:
      'This Font Software is licensed under the SIL Open Font License, Version 1.1. ' +
      'This license is available with a FAQ at https://scripts.sil.org/OFL',
  },
];
