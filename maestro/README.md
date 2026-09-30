# Maestro E2E

PLAN §7.4 의 자동 E2E 흐름. Android 에뮬레이터(API 36)의 **개발 빌드**에서 돌린다. Maestro 는 이 저장소 의존성이 아니다 — 각자 설치한다.

## 구성

```
maestro/
├─ config.yaml                 # 워크스페이스: flows/* 실행, 순서 고정, force-update 태그 제외
├─ flows/
│  ├─ auth-login-logout.yaml   # T-P1A  로그인 실패 안내 → 로그인 → 콜드 재시작 세션 유지 → 로그아웃
│  ├─ community-write.yaml     # T-P1B-12 글쓰기 → 댓글 → (다른 회원) 추천 → 신고 → 차단 → 차단 해제
│  ├─ guest-cart.yaml          # T-P1C-11 게스트 담기 → 강제 종료 → 재실행 → 장바구니 유지
│  ├─ guest-order-bank.yaml    # T-P1D-12 게스트 무통장 주문 → 주문 완료 → uid 주문 상세
│  ├─ account-delete.yaml      # T-P1A-07 e2e_user4 탈퇴 → 게스트 복귀 → 재로그인 실패 (되돌릴 수 없음, 맨 마지막)
│  ├─ payment-toss-mock-cancel.yaml # T-P1D-12 SDK 목 취소 → 안내·초안 취소 (toss-mock 태그)
│  ├─ payment-toss-recovery.yaml   # §7.6 5단계 confirm 전 종료 → 재실행 복구 → 카트 복원 (toss-mock 태그)
│  ├─ payment-toss-widget.yaml # T-P1D-06 게스트 카드 주문 → Toss 결제창(v2, 테스트 배지) → 닫기 → 결제 취소 안내
│  └─ force-update-gate.yaml   # T-P1A-09 강제 업데이트 게이트 (기본 실행에서 제외 — 아래 참고)
└─ subflows/                   # runFlow 전용: launch-fresh, login, logout, confirm-dialog, dismiss-popups, add-product-to-cart
```

셀렉터는 화면 컴포넌트의 `testID`(`id:`)와 `src/shared/i18n/ko.ts`·`shop.ko.ts` 의 한국어 문구(`text:`)만 쓴다. 문구를 바꾸면 흐름도 같이 고친다.

## 1. Maestro 설치 (한 번)

- 요구: Java 17+, Android SDK `adb` 가 PATH 에 있을 것.
- Windows: WSL 없이도 된다. <https://github.com/mobile-dev-inc/maestro/releases> 에서 `maestro.zip` 을 받아 풀고 `maestro\bin` 을 PATH 에 추가.
- macOS/Linux: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- 확인: `maestro --version`

## 2. 서버(dev) 준비

1. 에뮬레이터가 dev API 에 닿아야 한다. `localhost` 는 에뮬레이터에서 안 보이므로 `httpd-vhosts.conf` 의 localhost 블록에 `ServerAlias <LAN IP>` 를 추가하고(OPS-01.1) 앱은 `EXPO_PUBLIC_API_URL=http://<LAN IP>/api/v1` 로 빌드한다. 호스트를 바꾸면 게스트 카트 쿠키가 사라지므로 한 환경에서는 한 주소만 쓴다.
2. **매 실행 전** 서버 저장소(`<서버 폴더>`)에서 E2E 회원을 시드한다:
   ```
   E2E_PASSWORD='<비밀번호>' php nextjs/scripts/smoke/seed_e2e_members.php
   ```
   - `e2e_user1~4` 를 같은 비밀번호(`E2E_PASSWORD`)로 멱등 생성/리셋한다(OPS-01.2, 로컬 DB 에서만 동작). `account-delete` 가 지운 `e2e_user4` 도 다시 만든다. 비밀번호는 출력하지 않는다. 따라서 `E2E_PASSWORD2`·`E2E_DELETE_PASSWORD` 도 같은 값이다.
   - 차단 목록은 `community-write` 가 끝에서 스스로 해제하고, 중복 신고는 '이미 신고하셨습니다.' 로 통과한다. 관리자 계정(`e2e_admin`)은 아직 시드하지 않는다.
   - Maestro 는 셸 명령을 실행할 수 없으므로 PLAN 의 "onFlowStart 에서 시드" 는 `maestro test` 앞에 시드 명령을 붙이는 방식으로 대신한다.
3. 쇼핑 흐름용 상품 1개 + 커뮤니티 게시판 설정은 `php nextjs/scripts/smoke/seed_e2e_fixtures.php [--board=free]` 가 멱등으로 맞춘다(상품 `9990000001` `E2E Sample Item`, 게시판 추천 사용·분류 없음·level 2). 직접 준비한다면: 필수 옵션이 없고 재고가 있는 단품, **ASCII 이름**(예: `E2E Sample Item`) — Android `inputText` 는 한글을 입력하지 못한다. 이름에 정규식 특수문자(`( ) [ ] + ? *` 등)를 넣지 않는다.
4. 무통장 주문: 쇼핑몰 결제 설정에 무통장 사용 + 입금 계좌 1개 이상.
5. 커뮤니티: `E2E_BOARD`(기본 `free`) 게시판이 분류 필수가 아니고 level 2 회원이 쓰기/댓글/추천 가능해야 한다.

## 실측 실행 절차 (2026-09-26, Windows 11 + 에뮬레이터 API 35, Maestro 2.10.0 — 전 흐름 녹색)

처음 돌려 보며 막힌 곳과 해결을 그대로 적는다.

1. **에뮬레이터 언어를 한국어로.** 흐름의 `text:` 셀렉터가 한국어다. 루트 없는 이미지에서는 부팅 옵션으로 바꾼다:
   `emulator -avd <AVD> -change-locale ko-KR` (`adb shell settings get system system_locales` → `ko-KR`).
   앱별 언어(`cmd locale set-app-locales`)는 `clearState`(pm clear)가 지우므로 쓰지 않는다.
2. **dev API 중계.** vhost 가 `localhost:80` 에만 묶여 있어 에뮬레이터(`10.0.2.2` = 호스트 `localhost`)에서 안 보인다. vhost 에 `ServerAlias` 를 더하는 대신, 호스트에 작은 중계(localhost:18099 → localhost:80, Host 헤더를 `localhost` 로)를 띄우고
   `EXPO_PUBLIC_API_URL=http://10.0.2.2:18099/api/v1` 로 Metro 를 띄워도 된다(디버그 빌드는 cleartext 허용).
3. **Metro 는 E2E 플래그와 함께.** `EXPO_PUBLIC_E2E=1` 이면 개발용 경고 배너(LogBox)를 끈다 — 배너가 하단 탭 바를 덮어 탭 입력을 먹는다(같은 에뮬레이터로 두 계정이 로그인하면 `claim-device 409` 경고가 뜨는 것이 정상).
   ```
   EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:18099/api/v1 npx expo start --dev-client --port 8081
   ```
4. **Maestro 는 UTF-8 로.** Windows 에서는 JVM 기본 인코딩(CP949) 때문에 YAML 의 한국어가 깨져 `text:` 단언이 실패한다:
   `JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8` (PowerShell: `$env:JAVA_TOOL_OPTIONS='-Dfile.encoding=UTF-8'`). 콘솔 출력의 한글이 깨져 보이는 것은 표시 문제일 뿐이다.
5. **시드 → 실행.**
   ```
   E2E_PASSWORD='<비밀번호>' php nextjs/scripts/smoke/seed_e2e_members.php     # 서버 저장소
   php nextjs/scripts/smoke/seed_e2e_fixtures.php                              # 서버 저장소
   maestro test maestro -e E2E_USER=e2e_user1 -e E2E_PASSWORD=... -e E2E_USER2=e2e_user2 -e E2E_PASSWORD2=... \
     -e E2E_DELETE_USER=e2e_user4 -e E2E_DELETE_PASSWORD=... -e E2E_BOARD=free \
     -e E2E_PRODUCT_ID=9990000001 -e "E2E_PRODUCT_NAME=E2E Sample Item" -e E2E_GUEST_ORDER_PASSWORD=e2e1234
   ```
   `E2E_BOARD` 는 명시한다(흐름 안의 기본값 식이 비어 있을 수 있다).
6. **강제 업데이트 게이트는 네이티브 재빌드가 필요하다.** 덮어쓰기는 `Constants.expoConfig`(빌드에 박힌 설정)에서 읽으므로 Metro 만 다시 띄워서는 안 된다 — 아래 §6 대로 `npx expo run:android` 를 변수와 함께 다시 한다.
7. 실제로 찾은 앱 결함: Android New Architecture 에서 `NativeModules.I18nManager` 가 비어 기기 언어와 무관하게 영어로 뜨던 문제 — `I18nManager.getConstants()` 로 고쳤다(`src/__tests__/i18nOsLocale.test.ts`).

## 3. 앱 빌드·실행 (Android 에뮬레이터)

```
npx expo run:android
```

- 디버그(개발) 빌드를 에뮬레이터에 설치하고 Metro 를 띄운다. Metro 가 켜져 있어야 흐름이 돈다(`clearState` 뒤에도 같은 Metro 에 다시 붙는다).
- appId 는 `kr.sirsoft.gnuboard5` (`src/config/appIds.ts` 의 `APP_PACKAGE`).
- 개발 빌드의 LogBox 경고 배너가 하단 탭을 가리면 탭 탭이 실패할 수 있다. 경고가 계속 뜨면 먼저 원인을 고치거나, 한 번 닫아 둔다.
- Expo Go 는 쓰지 않는다(쿠키 저장소 공유 — PRD §7.2).

## 4. 환경 변수

자격 증명은 흐름 파일에 쓰지 않는다. `-e` 로 넘긴다.

| 변수 | 쓰는 흐름 | 값 |
|---|---|---|
| `E2E_USER` / `E2E_PASSWORD` | auth-login-logout, community-write(작성자) | `e2e_user1` |
| `E2E_USER2` / `E2E_PASSWORD2` | community-write(추천·신고·차단) | `e2e_user2` |
| `E2E_DELETE_USER` / `E2E_DELETE_PASSWORD` | account-delete | **반드시 `e2e_user4`** — 다른 값이면 흐름이 첫 단계에서 멈춘다 |
| `E2E_BOARD` | community-write | 게시판 `bo_table`, 기본 `free` |
| `E2E_PRODUCT_ID` / `E2E_PRODUCT_NAME` | guest-cart, guest-order-bank | 위 2-3 의 상품 `it_id` / 이름 |
| `E2E_GUEST_ORDER_PASSWORD` | guest-order-bank | 비회원 주문 비밀번호(영문/숫자 3자 이상) |

PowerShell 예 (비밀번호는 로컬 비밀 파일이나 세션 변수에서 읽어 온다):

```powershell
$env:E2E_PASSWORD = '<비밀번호>'; php <서버 폴더>\nextjs\scripts\smoke\seed_e2e_members.php
maestro test maestro `
  -e E2E_USER=e2e_user1 -e E2E_PASSWORD=$env:E2E_PASSWORD `
  -e E2E_USER2=e2e_user2 -e E2E_PASSWORD2=$env:E2E_PASSWORD2 `
  -e E2E_DELETE_USER=e2e_user4 -e E2E_DELETE_PASSWORD=$env:E2E_DELETE_PASSWORD `
  -e E2E_PRODUCT_ID=$env:E2E_PRODUCT_ID -e E2E_PRODUCT_NAME="$env:E2E_PRODUCT_NAME" `
  -e E2E_GUEST_ORDER_PASSWORD=$env:E2E_GUEST_ORDER_PASSWORD
```

- 한 흐름만: `maestro test maestro/flows/guest-cart.yaml -e ...`
- 태그로 고르기: `maestro test maestro --include-tags=smoke -e ...` (smoke = 로그인/로그아웃 + 게스트 카트)
- 파괴적 흐름 빼기: `--exclude-tags=destructive`

## 5. 흐름별 서버 시드 필요 여부

| 흐름 | `seed_e2e_members.php` | 기타 전제 |
|---|---|---|
| auth-login-logout | 필요(e2e_user1) | — |
| community-write | 필요(e2e_user1·2, user2 차단/신고 초기화) | 게시판 권한 |
| guest-cart | 불필요 | E2E 상품 |
| guest-order-bank | 불필요 | E2E 상품, 무통장 설정 (dev 에 주문 행이 쌓인다 — `nextjs/scripts/smoke/cleanup_nextjs_smoke_orders.php` 류로 정리) |
| account-delete | **매 실행 필수**(e2e_user4 재생성) | SC-20 dev 배포(탈퇴 익명화) |
| force-update-gate | 불필요 | 덮어쓰기 빌드(아래) |

## 6. 강제 업데이트 게이트 (별도 실행)

`EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE` 는 개발 빌드에서만 읽힌다(`src/shared/lib/e2eSettingsOverride.ts`, 다른 EAS 프로필에서는 app.config.ts 가 빌드를 멈춘다).

```powershell
$env:EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE='{"app_min_version":"999.0.0"}'
npx expo run:android
maestro test maestro/flows/force-update-gate.yaml
Remove-Item Env:EXPO_PUBLIC_E2E_SETTINGS_OVERRIDE
npx expo run:android   # 덮어쓰기 없는 빌드로 되돌린 뒤 나머지 스위트 실행
```

Metro 만 다시 띄우는 것으로는 적용되지 않는다(위 '실측 실행 절차' 6). PLAN 의 대안인 `scripts/e2e-set-min-version.ps1`(서버 설정을 직접 바꾸는 방식)은 아직 없다.

## 결제 목 흐름 (Toss SDK 목, 개발 빌드)

실제 카드 인증 없이 결제 경로를 돌리는 흐름은 `toss-mock` 태그라 기본 실행에서 빠진다. Metro 를 목 변수와 함께 다시 띄운 뒤 흐름 하나씩 실행한다(네이티브 재빌드 불필요 — JS 에 들어가는 값):

```
EXPO_PUBLIC_TOSS_MOCK=cancel EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_API_URL=... npx expo start --dev-client
maestro test maestro/flows/payment-toss-mock-cancel.yaml -e E2E_PRODUCT_ID=9990000001 -e "E2E_PRODUCT_NAME=E2E Sample Item" -e E2E_GUEST_ORDER_PASSWORD=e2e1234

EXPO_PUBLIC_TOSS_MOCK=success EXPO_PUBLIC_DEBUG_CONFIRM_DELAY_MS=15000 EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_API_URL=... npx expo start --dev-client
maestro test maestro/flows/payment-toss-recovery.yaml -e ...(같음)
```

`payment-toss-widget.yaml` 은 목 **없이**(실제 Toss 결제창) 돈다 — 관리자 쇼핑몰 설정이 '테스트결제'여야 한다. 실측 2026-09-26: 세 흐름 모두 녹색. 승인 성공은 `docs/DEVICE-QA.md`.

## 7. 아직 자동화하지 않은 것

- 글쓰기 **이미지 첨부**: 시스템 사진 선택기를 거쳐야 해서 뺐다(`tool-photo` / `compose-attachment-add` 셀렉터는 있음). 에뮬레이터에 사진을 `adb push` 해 두고 선택기 UI 를 기기별로 다루는 흐름이 필요하다.
- 신고 3건 → `auto_hidden` 단언: 작성자 외 신고 계정 3개가 필요하다(현재 e2e_user1~3 중 작성자 1 + 신고자 2). `e2e_user4` 는 탈퇴 전용이라 쓰지 않는다 — 시드에 신고 계정을 하나 더 두면 추가한다.
- 복구 시트(pending 세션 주입), 푸시 탭 `order`/`comment`(adb payload 주입), Toss SDK 목(`EXPO_PUBLIC_TOSS_MOCK` — 앱 코드에 아직 없음) 성공/취소: T-P1D-12 의 나머지 3흐름(`payment-*.yaml`).
- SC-20 탈퇴 익명화 검증(`GET /shop/reviews` 의 `탈퇴회원`)은 UI 가 아니라 계약 테스트에서 한다.
- P2 흐름(`p2-*.yaml`: 리뷰 → 신고 → 차단, 구매확정 → 포인트, KCP/Inicis 테스트 결제)은 P2 화면·플래그가 켜진 뒤 작성.
- iOS: 흐름은 `id`/`text` 위주라 대부분 그대로지만, `back` 명령(Android 전용)과 Alert 버튼 처리(`subflows/confirm-dialog.yaml` 의 iOS 분기)는 시뮬레이터에서 확인하지 않았다.
