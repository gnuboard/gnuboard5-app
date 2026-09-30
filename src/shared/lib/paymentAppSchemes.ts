/**
 * 결제·본인인증 WebView 가 열어도 되는 외부 앱 스킴(허용 목록, 소문자). 여기 없는 스킴은 막는다 — 손상되거나 다른 곳으로
 * 리디렉트된 결제 페이지가 브리지·링크로 임의 앱 딥링크(전화·문자·다른 앱 동작)를 열지 못하게 한다(2026-09-29 보안 검토).
 *
 * 출처(PG 사 WebView 연동 문서의 앱 스킴 목록을 합쳤다):
 *  - 토스페이먼츠 https://docs.tosspayments.com/guides/v2/webview
 *  - 페이플(KG이니시스·카드사 공통) https://docs.payple.kr/webview
 * 결제 중에 뜨는 보안 앱(안랩 V3·mVaccine)과 PASS 본인인증(SKT·KT·LGU+)도 포함한다.
 * 새 카드사·간편결제 앱이 막히면 앱 내 로그(설정 → 앱 로그)의 `webview blocked scheme` 을 보고 여기에 더한다.
 */
export const PAYMENT_APP_SCHEMES: ReadonlySet<string> = new Set([
  // ISP·계좌이체·간편결제
  'ispmobile',
  'kftc-bankpay',
  'kb-bankpay',
  'bankwallet',
  'kpay',
  'paypin',
  'payco',
  'lpayapp',
  'lmslpay',
  'shinsegaeeasypayment',
  'kakaotalk',
  'kakaobank',
  'supertoss',
  'naversearchapp',
  'naversearchthirdlogin',
  'payprotocolwalletkr',
  'uppay',
  'lguthepay',
  'lguthepay-xpay',
  'smartxpay-transfer',
  // KB
  'kb-acp',
  'kbbank',
  'liivbank',
  'newliiv',
  // NH
  'nhappcardansimclick',
  'nhallonepayansimclick',
  'nonghyupcardansimclick',
  'nhappcash-acp',
  // 롯데
  'lottesmartpay',
  'lotteappcard',
  // 삼성
  'mpocket.online.ansimclick',
  'mpocket.ansimclick.cert',
  'scardcertiapp',
  'samsungpay',
  'monimopay',
  'monimopayauth',
  // 신한
  'shinhan-sr-ansimclick',
  'shinhan-sr-ansimclick-payco',
  'shinhan-sr-ansimclick-naverpay',
  'smshinhanansimclick',
  // 우리
  'com.wooricard.wcard',
  'newsmartpib',
  'wooripay',
  'woorimembers',
  'wibeetalk',
  // 씨티
  'citispay',
  'citicardappkr',
  'citimobileapp',
  // 하나
  'cloudpay',
  'hanawalletmembers',
  'hanaskcardmobileportal',
  'hanamopmoasign',
  // 현대
  'hdcardappcardansimclick',
  'smhyundaiansimclick',
  // 기타 은행·카드 공용
  'tswansimclick',
  'banka',
  'iphonesbank',
  'smartbank2wib',
  'smartbank2wb',
  'portalcenterwb',
  'ansimclickscard',
  'ansimclickipcollect',
  // 보안 앱
  'vguardstart',
  'v3mobileplusweb',
  'mvaccinestart',
  // PASS 본인인증(SKT·KT·LGU+)
  'tauthlink',
  'ktauthexternalcall',
  'upluscorporation',
]);
