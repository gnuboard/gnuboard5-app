# 그누보드5 앱 (GNU Board 5 App)

그누보드5 커뮤니티와 영카트5 쇼핑몰을 하나로 묶은 모바일 앱입니다. Expo(React Native)로 만들었고 Android·iOS 에서 동작합니다.

- 커뮤니티: 게시판·글쓰기·댓글·추천·신고·차단, 최신글, 검색, 알림
- 쇼핑: 상품·장바구니·주문(회원/비회원), 토스페이먼츠·PG 결제, 주문 조회
- 회원: 로그인·가입·소셜 로그인·본인인증·프로필·탈퇴
- 다크 모드, 한국어/영어, 브라우저에서 둘러보는 [웹 데모](docs/web-demo.md)

## 먼저 필요한 것

이 저장소는 **앱만** 담고 있습니다. 앱은 그누보드5(영카트5) 사이트에 설치하는 REST API(`/api/v1`)와 통신하므로,
API 가 설치된 사이트가 있어야 동작합니다.

서버 API 는 [gnuboard/gnuboard5-nextjs](https://github.com/gnuboard/gnuboard5-nextjs) 의 Release 파일
`gnuboard5-nextjs-vX.Y.Z.zip` 에 들어 있습니다(`api/`, `plugin/webapp/`, `extend/webapp.extend.php`).
그누보드 루트에 풀면 테마를 바꾸지 않아도 `/api/v1` 이 동작합니다.

- Node.js 22 이상
- Android Studio(에뮬레이터) 또는 Xcode(iOS 시뮬레이터)

## 빠른 시작

```bash
npm ci
cp .env.example .env     # EXPO_PUBLIC_API_URL 을 내 사이트의 API 주소로 바꾼다 (예: https://example.com/api/v1)
npx expo run:android     # 개발 빌드를 만들어 에뮬레이터에 설치하고 실행
```

Expo Go 로는 실행하지 않습니다(iOS 에서 다른 앱과 쿠키 저장소를 같이 써서 로그인·장바구니가 섞입니다). 개발 빌드를 쓰세요.

## 내 사이트용으로 빌드하기

앱 ID·사이트 주소 같은 기본값을 내 사이트에 맞게 바꿉니다.

| 무엇 | 어디 |
|---|---|
| 앱 ID(패키지명)·딥링크 스킴·사이트 호스트 | [src/config/appIds.ts](src/config/appIds.ts) 와 [app.config.ts](app.config.ts) 위쪽 상수 (두 곳이 같아야 한다 — `appIds.test.ts` 가 확인) |
| API 주소 | `.env` 의 `EXPO_PUBLIC_API_URL`, 스토어 빌드는 [eas.json](eas.json) 의 `env` |
| 앱 이름 | 빌드 전에 `npm run sync:app-name -- --api <API 주소>` — 사이트 관리자 설정의 사이트 제목(`cf_title`)을 가져온다 |
| 아이콘·스플래시 | [scripts/generate-icons.mjs](scripts/generate-icons.mjs) 의 마크를 바꾼 뒤 `npm run icons` |
| EAS·Sentry | `.env.example` 의 `EXPO_PUBLIC_EAS_*`, `EXPO_PUBLIC_SENTRY_*` |

## 명령

| 명령 | 설명 |
|---|---|
| `npm run check` | 타입 검사 + lint + 테스트 |
| `npm test` / `npm run test:coverage` | 단위·통합 테스트 (jest) |
| `npm run icons` | 앱 아이콘 세트 생성 |
| `npm run web:demo` | 웹 데모 내보내기 (`dist-web/`) |
| `npm run sync:app-name -- --api <API>` | 사이트 제목을 앱 이름으로 동기화 |
| `npm run contract:test` | 서버 API 계약 테스트 (개발 서버 대상) |
| `npm run store:check` | 스토어 제출 준비 점검 |

E2E 테스트는 [maestro/README.md](maestro/README.md) 를 보세요.

## 문서

- [docs/web-demo.md](docs/web-demo.md) — 웹 데모 만들고 올리기
- 서버 API 문서는 [gnuboard/gnuboard5-nextjs](https://github.com/gnuboard/gnuboard5-nextjs) 에 있습니다.

## 라이선스

- 프로그램 명칭: 그누보드5 앱 (GNU Board 5 App)
- 저작자: (주)에스아이알소프트 (SIR Soft) <https://sir.kr>
- 라이선스: GNU LGPL 2.1 — 그누보드5 와 같은 라이선스입니다. 전문은 [LICENSE](LICENSE)(영문 원문)에 있습니다.
  한국어 번역문은 [그누보드5 의 LICENSE.txt](https://github.com/gnuboard/gnuboard5/blob/master/LICENSE.txt) 를 참고하세요.
  번역문과 원문의 내용이 다르면 원문이 우선합니다.

앱에 들어간 다른 오픈소스(Pretendard 글꼴 등)의 라이선스는 앱의 **설정 → 오픈소스 라이선스** 화면과
[src/features/mypage/settings/openSourceLicenses.ts](src/features/mypage/settings/openSourceLicenses.ts) 에 있습니다.
