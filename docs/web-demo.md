# 웹 데모

앱을 설치하지 않고 브라우저에서 둘러볼 수 있는 데모다. 같은 React Native 코드를 Expo 웹(react-native-web)으로 내보내
그누보드 사이트의 하위 폴더(기본 `/demo/`)에 올린다.

## 만들기

```bash
npm run web:demo            # dist-web/ 생성 (운영 API: https://{APP_LINK_HOST}/api/v1, 폴더 /demo)
```

- `DEMO_BASE_PATH=/preview npm run web:demo` — 다른 폴더에 올릴 때.
- `DEMO_API_URL=http://localhost:18099/api/v1 npm run web:demo` — 로컬 개발 서버로 확인할 때.
- 글꼴(`public/fonts/*.woff2`)은 `python scripts/build-web-fonts.py` 로 다시 만든다(원본 OTF 를 KS X 1001 한글 2,350자
  + 라틴·기호로 줄인 것, 약 780KB). 그 밖의 글자는 브라우저 기본 글꼴로 보인다.

## 올리기

`dist-web/` 안의 파일을 **통째로** 사이트의 `/demo/` 폴더에 올린다(FTP). 숨김 파일 `.htaccess` 도 함께 올려야
`/demo/cart` 같은 주소에서 새로고침해도 앱이 뜬다.

- **반드시 API 와 같은 사이트(같은 도메인·같은 http/https)** 에 올린다. 서버의 CORS·쓰기 출처 검사는 사이트 주소(`G5_URL`)만
  믿는다. 다른 도메인에 올리려면 서버 설정 `G5_CORS_ALLOWED_ORIGINS` 에 그 주소를 더해야 한다.
- 서버 코드는 바꾸지 않는다.

## 웹에서 되는 것 / 막은 것

| 기능 | 웹 데모 |
|---|---|
| 커뮤니티·쇼핑 둘러보기, 글 읽기, 상품 상세 | 된다 |
| 로그인(아이디/비밀번호), 글쓰기·댓글, 장바구니 | 된다 — **운영 데이터에 실제로 반영된다** |
| 결제·주문 | 주문서까지 보이고, 결제 버튼은 "앱에서 주문" 안내만 띄운다 |
| 본인인증·현금영수증·PG 결제창·우편번호 찾기 | "앱에서 이용할 수 있어요" 안내 화면 |
| 소셜 로그인, 푸시 알림, 애플 로그인 | 숨김/동작 안 함 |

## 웹 전용 보완 (src/shared/web)

- `basePath` — 화면 주소에 폴더 접두어를 떼고 붙인다(linkingConfig).
- `webFonts` — Pretendard woff2 를 `@font-face` 로 등록한다.
- `webAlert` — react-native-web 의 `Alert.alert` 는 아무것도 띄우지 않아 브라우저 확인창으로 바꿔 끼운다.
- `frame` / `WebFrame` — PC 에서는 앱을 480 폭 휴대폰 틀로 가운데 그린다. 폭에 맞춰 크기를 정하는 화면은
  `useFrameDimensions()` 를 쓴다.
- `webKeyValueStore` — 비회원 장바구니 번호를 localStorage 에 둔다(새로고침 뒤에도 유지).

## 알려진 한계

- PC 화면에서 아래에서 올라오는 시트(신고·쿠폰 등)는 휴대폰 틀이 아니라 창 전체 폭으로 뜬다.
- 버튼이 셋 이상인 확인창은 브라우저 확인창 하나(주 버튼/취소)로 줄어든다.
