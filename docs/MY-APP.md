# 내 사이트 앱 만들기

이 앱은 누구나 **자기 그누보드5(영카트5) 사이트의 앱**으로 바꿔서 Google Play·App Store 에 출시할 수 있습니다.
다만 받은 그대로 올리면 안 됩니다. 이 문서는 무엇을 바꾸고, 무엇을 지켜야 하는지 순서대로 설명합니다.

> 받은 그대로의 앱 ID(`kr.sirsoft.gnuboard5`)·스킴(`sirsoft-g5`)·G5 로고는 (주)에스아이알소프트의
> **공식 그누보드5 앱** 것입니다. 스토어는 같은 앱 ID 를 두 번 받지 않으므로, 바꾸지 않으면 업로드부터 거절됩니다.

## 먼저 알아 둘 것: 스토어 정책

스토어는 "템플릿으로 찍어 낸 똑같은 앱"을 스팸으로 봅니다. 아래 세 가지를 지키면 됩니다.

1. **내 개발자 계정으로 직접 제출합니다.** 앱 안에 보이는 사이트(콘텐츠)의 주인이 제출해야 합니다.
   애플은 템플릿으로 만든 앱을 콘텐츠 주인이 아닌 사람(대행업체 등)이 올리면 거절합니다.
   여러 사이트의 앱을 만들어 주는 경우라면 **각 사이트 운영자의 계정**으로 제출하세요.
2. **내 앱이라는 것이 보여야 합니다.** 이름·아이콘·스토어 설명·스크린샷이 내 사이트 것이어야 하고,
   앱 안에 내 사이트의 글·상품이 보여야 합니다. 이미 있는 앱과 거의 같아 보이면 스팸으로 거절될 수 있습니다.
3. **공식 앱처럼 보이면 안 됩니다.** G5 로고와 "그누보드" 이름은 (주)에스아이알소프트의 것입니다.
   앱 이름·아이콘·설명에 쓰지 마세요. 공식 앱으로 오해할 수 있어 사칭으로 신고될 수 있습니다.

## 1. brand.json 바꾸기

저장소 맨 위의 [brand.json](../brand.json) 한 파일만 고치면 앱 ID·스킴·도메인·아이콘 색이 모두 바뀝니다.

```json
{
  "appName": "우리동네",
  "package": "kr.co.ourtown.app",
  "scheme": "ourtown",
  "siteHost": "ourtown.co.kr",
  "slug": "ourtown-app",
  "easProjectId": "",
  "easOwner": "",
  "logo": "assets/brand/logo.png",
  "colors": {
    "accent": "#e4572e",
    "iconBackground": "#ffffff",
    "splashBackground": "#ffffff"
  }
}
```

| 항목 | 무엇인가요 | 규칙 |
|---|---|---|
| `appName` | 사이트 제목을 못 읽었을 때 쓰는 앱 이름 | 30자 이하. 보통 사이트 제목과 같게 |
| `package` | 스토어가 앱을 구별하는 ID. **한 번 올리면 못 바꿉니다** | 도메인을 거꾸로: `ourtown.co.kr` → `kr.co.ourtown.app`. 영소문자·숫자, 점으로 2마디 이상 (`_`·`-` 안 됨) |
| `scheme` | 소셜 로그인·결제 뒤 앱으로 돌아오는 주소 이름 (`ourtown://…`) | 영소문자로 시작. 다른 앱과 겹치지 않게 |
| `siteHost` | 내 사이트 도메인 | `https://` 와 `/` 없이 소문자로 |
| `slug` | Expo(EAS) 프로젝트 이름 | 영소문자·숫자·하이픈 |
| `easProjectId`·`easOwner` | Expo 프로젝트 ID·계정 (4장). 아직 없으면 `""` | `eas init` 이 알려 준 값 |
| `logo` | 내 로고 그림 (2장 참고). 비우면 G5 로고 | 저장소 안의 `.png`·`.svg` 경로 |
| `colors.accent` | 알림 아이콘 색 | `#rrggbb` |
| `colors.iconBackground` | 앱 아이콘 바탕색 | `#rrggbb` |
| `colors.splashBackground` | 시작 화면 바탕색 | `#rrggbb` |

값이 틀리면 `npx expo start`·빌드가 **무엇을 고칠지 알려 주고 멈춥니다.**

### API 주소 (두 곳)

- 내 컴퓨터에서 실행: `.env` 의 `EXPO_PUBLIC_API_URL=https://ourtown.co.kr/api/v1`
- 스토어 빌드: [eas.json](../eas.json) 의 `preview`·`production` 안 `env.EXPO_PUBLIC_API_URL`

### 앱 이름

스토어·휴대폰에 보이는 이름은 **사이트 제목**(관리자 → 기본환경설정 → 홈페이지 제목)을 씁니다. 빌드 전에:

```bash
npm run sync:app-name     # brand.json 의 siteHost 사이트에서 제목을 읽는다 (다른 주소면 -- --api <API 주소>)
```

만들어진 `.env.app-name` 의 한 줄(`EXPO_PUBLIC_APP_NAME=…`)을 `.env` 에 옮겨 적고, 스토어 빌드용으로
`eas.json` 의 `production` 안 `env` 에도 같은 줄을 넣습니다.

## 2. 아이콘 바꾸기

1. 로고를 **배경이 투명한 PNG**(가로세로 512px 이상) 또는 SVG 로 준비해 `assets/brand/` 에 넣습니다.
2. `brand.json` 의 `logo` 에 경로를 적습니다 (예: `"assets/brand/logo.png"`).
3. 실행합니다.

```bash
npm run icons
```

로고 둘레의 투명한 여백은 알아서 잘라 내고 가운데에 맞춥니다. `assets/` 에 아이콘 6종이 새로 만들어집니다.

| 파일 | 쓰이는 곳 |
|---|---|
| `icon.png` | 아이폰·기본 앱 아이콘 (바탕 = `colors.iconBackground`) |
| `adaptive-icon.png` | 안드로이드 앱 아이콘 |
| `adaptive-icon-monochrome.png` | 안드로이드 13+ 테마 아이콘 (한 색) |
| `notification-icon.png` | 안드로이드 알림 아이콘 (흰색 한 색) |
| `splash-icon.png` | 시작 화면 |
| `favicon.png` | 웹 데모 |

- 테마 아이콘·알림 아이콘은 로고의 **모양만** 한 색으로 칠합니다. 배경이 칠해진 로고는 네모가 되고,
  로고 안쪽의 흰 무늬는 사라집니다. 마음에 들지 않으면 그 두 파일만 디자이너가 만든 그림으로 바꿔 넣으세요.
- 내 컴퓨터의 개발 빌드에 반영하려면 `npx expo prebuild --platform android` 뒤 `npx expo run:android` 를 다시 실행합니다.

## 3. 내 사이트(서버) 설정

### 앱 스킴 허락하기

사이트는 허락된 스킴으로만 로그인·결제 결과를 돌려보냅니다. 사이트의 `api/.env` 에 내 스킴을 적으세요.

```text
G5_SOCIAL_MOBILE_SCHEMES=ourtown
```

이 한 줄이 **소셜 로그인과 결제 복귀** 둘 다에 쓰입니다. 빠뜨리면 로그인·결제를 마친 뒤 내 앱으로 돌아오지 않습니다.
서버 API 가 오래된 판이면 결제 복귀에는 이 설정이 적용되지 않으니, 서버 API 를 최신 Release 로 바꾸세요.

### 앱 링크 파일

사이트 링크(`https://ourtown.co.kr/app/…`)를 눌렀을 때 앱이 바로 열리게 하려면, 사이트의
`/.well-known/` 폴더에 두 파일을 둡니다.

- `assetlinks.json` (안드로이드): `package_name` 에 내 앱 ID, `sha256_cert_fingerprints` 에 Play Console 의
  **앱 서명 키 SHA-256** 을 적습니다.
- `apple-app-site-association` (아이폰): `appIDs` 에 `내팀ID.내앱ID` (예: `ABCDE12345.kr.co.ourtown.app`).
  확장자 없이, `Content-Type: application/json` 으로 보내야 합니다.

## 4. 내 계정 만들기

공식 앱의 계정·키는 쓸 수 없습니다. 모두 내 것으로 새로 만듭니다.

- Expo 계정 → `npx eas login` 뒤 `npx eas init --force` 가 알려 주는 프로젝트 ID 를 `brand.json` 의 `easProjectId` 에,
  Expo 계정 이름을 `easOwner` 에 적습니다 (알림 토큰·`eas credentials`·OTA 에 필요)
- Google Play 개발자 계정, Apple Developer Program
- 푸시 알림: Firebase 프로젝트에 내 앱 ID 로 Android 앱을 추가하고 `google-services.json` 을 받아 저장소 맨 위 폴더에
  둡니다(git 에는 올라가지 않고, 빌드가 알아서 씁니다). Firebase 의 **서비스 계정 비공개 키**(JSON)는 expo.dev →
  프로젝트 → Credentials → Android 의 FCM V1 항목에 올립니다 — 이 키는 비밀이니 저장소에 두지 마세요.
- 결제: 내 사이트의 PG(토스페이먼츠 등) 계약 — 영카트 관리자에 넣은 키를 앱이 그대로 씁니다
- (선택) 오류 수집 Sentry: `.env` 의 `EXPO_PUBLIC_SENTRY_*`

### 앱 업데이트 서명 (OTA)

스토어를 거치지 않고 화면 코드를 고쳐 보내는 OTA 업데이트(`eas update`)는 **내 키로 서명**합니다.
공식 앱의 인증서는 쓸 수 없으니 새로 만듭니다.

```bash
npx expo-updates codesigning:generate --key-output-directory certs/.generated --certificate-output-directory certs --certificate-validity-duration-years 10 --certificate-common-name "우리동네"
```

만들어진 `certs/certificate.pem` 의 이름을 `certs/expo-updates-certificate.pem` 으로 바꿉니다(이 파일은 저장소에 올립니다).
`certs/.generated/private-key.pem` 은 **절대 올리지 말고** 따로 안전하게 보관하세요 — 잃어버리면 OTA 업데이트를 못 보냅니다.

## 5. 점검하기

```bash
npm test                          # brand.json 이 틀리면 여기서 실패
npm run store:check -- --strict   # 경고가 하나라도 있으면 실패
```

`store:check` 는 항목마다 `[OK]`·`[WARN]`·`[FAIL]` 과 고치는 방법을 보여 줍니다. 내 앱에서 자주 나오는 경고:

| 경고 | 고치는 방법 |
|---|---|
| 공식 그누보드5 앱 것을 그대로 쓰고 있어요 | 1장 — `brand.json` 의 `package`·`scheme`·`logo` |
| siteHost 가 예시 주소예요 | 1장 — `brand.json` 의 `siteHost` |
| 앱 아이콘이 지금 brand.json 의 로고·바탕색과 달라요 | 2장 — `npm run icons` |
| eas.json production 의 API 주소가 siteHost 와 달라요 | 1장 — `eas.json` 의 API 주소 |
| `EXPO_PUBLIC_APP_NAME is not set` | 1장 — `sync:app-name` 이 만든 `.env.app-name` 의 줄을 `.env` 에 옮겨 적기 |
| `EAS projectId is not set` | 4장 — `eas init` 뒤 `brand.json` 의 `easProjectId` |
| `Expo Updates code signing is not configured` | 4장 — 앱 업데이트 서명 (프로젝트 ID 를 넣어야 이 검사가 켜집니다) |

`--strict` 가 경고 없이 통과하면 제출 준비가 된 것입니다.

> Maestro E2E 테스트(`maestro/`)를 쓴다면, 흐름 파일의 `appId: kr.sirsoft.gnuboard5` 와 `sirsoft-g5://` 도
> 내 앱 ID·스킴으로 찾아 바꾸세요.

## 6. 스토어 등록할 때

- **Google Play 개인 계정**은 처음 출시 전에 **테스터 12명 이상이 14일 연속** 참여하는 비공개 테스트를 거쳐야
  프로덕션 출시를 신청할 수 있습니다. 조직(회사) 계정이면 이 조건이 없습니다. 일정에 2~3주를 더 잡으세요.
- 개인정보처리방침 주소가 필요합니다 (사이트의 개인정보처리방침 페이지).
- 회원 탈퇴는 앱 안에 있습니다 (설정 → 회원 탈퇴). 스토어 양식의 "계정 삭제" 항목에 그 경로를 적으세요.
- 심사용 테스트 계정(아이디·비밀번호)을 사이트에 만들어 심사 메모에 적어 주세요.
- 결제를 테스트 모드로 둔 채 심사받는다면, 심사 메모에 테스트 결제 방법을 적습니다.

## 라이선스

이 앱은 GNU LGPL 2.1 입니다([LICENSE](../LICENSE)). 내 앱으로 바꿔 배포해도 되지만, 라이선스가 요구하는
고지(저작자·라이선스 표시)를 지워서는 안 되고, 앱의 소스를 고쳐 배포했다면 고친 소스를 같은 라이선스로 제공해야 할 수 있습니다.
자세한 조건은 LICENSE 원문을 확인하세요.

## 확인표

- [ ] `brand.json` 의 `package`·`scheme`·`siteHost`·`slug`·`logo` 를 내 것으로 바꿨다
- [ ] `npm run icons` 로 내 로고 아이콘을 만들었다
- [ ] `.env`·`eas.json` 의 API 주소를 내 사이트로 바꿨다
- [ ] 사이트 `api/.env` 에 `G5_SOCIAL_MOBILE_SCHEMES=내스킴` 을 적었다
- [ ] 사이트 `/.well-known/` 의 두 파일을 내 앱 것으로 바꿨다
- [ ] Expo·Firebase·스토어 계정을 내 것으로 만들었다
- [ ] OTA 업데이트 서명 인증서를 새로 만들고, 개인키를 따로 보관했다
- [ ] `npm test` 와 `npm run store:check -- --strict` 가 통과한다
- [ ] 앱 이름·아이콘·스토어 설명에 "그누보드"·G5 로고를 쓰지 않았다
