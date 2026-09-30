/**
 * 네비게이션 파라미터 타입 (PLAN T-P0-10, ARCH §4.1).
 *
 * RootStack ─ MainTabs(5탭, 탭별 native-stack) + 상세/모달 화면.
 * 승계 화면(Boards/PostList/PostDetail/Notifications …)은 지금은 RootStack 에 push 되어 탭바 위에 뜬다 —
 * "탭 루트에서만 탭바 노출"을 가장 단순하게 만족한다. P1 에서 각 탭 스택으로 옮긴다.
 * `BoardCode` 는 런타임 문자열(`GET /boards` 값 + zod 형식 검증, T-P1B-02).
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

/** 게시판 식별자(bo_table) — 런타임 문자열, 형식은 shared/lib/routeParams.boTableSchema 로 검증. */
export type BoardCode = string;

export type HomeStackParamList = { Home: undefined };
export type CommunityStackParamList = { CommunityHome: undefined };
export type ShopStackParamList = { ShopHome: undefined };
export type CartStackParamList = { Cart: undefined };
export type RecentStackParamList = { RecentHome: undefined };
export type MyStackParamList = { My: undefined; Scraps: undefined; MyPosts: undefined; MyComments: undefined };

export type MainTabsParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  CommunityTab: NavigatorScreenParams<CommunityStackParamList> | undefined;
  ShopTab: NavigatorScreenParams<ShopStackParamList> | undefined;
  RecentTab: NavigatorScreenParams<RecentStackParamList> | undefined;
  CartTab: NavigatorScreenParams<CartStackParamList> | undefined;
  MyTab: NavigatorScreenParams<MyStackParamList> | undefined;
};

export type MainTabName = keyof MainTabsParamList;
export const MAIN_TAB_NAMES: readonly MainTabName[] = [
  'HomeTab',
  'CommunityTab',
  'RecentTab',
  'ShopTab',
  'CartTab',
  'MyTab',
];

/** 로그인 후 돌아갈 곳 — Login 파라미터로 직렬화 가능해야 한다(딥링크·상태 복원). */
export type ReturnTo = {
  [K in keyof RootStackParamList]: { name: K; params: RootStackParamList[K] };
}[keyof RootStackParamList];

/** 우편번호 검색 결과 — 5자리 우편번호, 선택한 주소(도로명/지번), 참고항목, 도로명 선택 시의 지번. */
export interface PostcodeResult {
  zonecode: string;
  address: string;
  extra: string;
  jibun: string;
}

/** 우편번호 결과를 받을 수 있는 화면(주문서는 P1-D 에서 추가). */
export type PostcodeTarget = 'AddressForm' | 'Checkout';
/** 주문서처럼 주소 칸이 여럿인 화면에서 어느 칸의 결과인지. */
export type PostcodeField = 'orderer' | 'recipient';

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;

  // Auth & legal (모달 그룹)
  Login: { returnTo?: ReturnTo } | undefined;
  Signup: undefined;
  /** 비밀번호 재설정 메일 요청(T-P1A-06). 재설정은 메일 링크의 웹 페이지가 한다. */
  ForgotPassword: undefined;
  /** 회원 탈퇴(T-P1A-07) — 즉시·비가역 안내 + 비밀번호 또는 소셜 재인증. */
  Withdraw: undefined;
  /** 내 정보 수정(T-P1A-08, MB-08) — 아이디 표시. */
  Profile: undefined;
  /** 비밀번호 변경(T-P1A-08, MB-09) — 성공 시 새 비밀번호로 재로그인. */
  ChangePassword: undefined;
  /** 가입 결과(T-P1A-05): 바로 로그인됐으면 환영, 이메일 인증이 필요하면 안내. */
  SignupResult:
    | { kind: 'welcome'; nick: string; extrasPending?: boolean }
    | { kind: 'verify_email'; email: string; extrasPending?: boolean };
  /** 미연동 소셜 프로필 가입(T-P1A-04). 가입 ticket·PKCE verifier 는 파라미터가 아니라 메모리 저장소에 있다. */
  SocialSignup: { returnTo?: ReturnTo } | undefined;
  /** 미연동 소셜 프로필을 기존 계정에 연결(T-P1A-04). */
  SocialLink: { returnTo?: ReturnTo } | undefined;
  LegalText: { kind: 'terms' | 'privacy' };

  // Notifications
  Notifications: undefined;

  // Debug / admin
  AppLog: undefined;
  ReportModeration: undefined;
  /** 차단 목록 관리(CM-14) — Settings 하위. */
  BlockedUsers: undefined;
  /** 오픈소스 라이선스 고지(MB-13) — Settings 하위. */
  OpenSourceLicenses: undefined;
  /** 사업자 신원정보(전자상거래법 제10조, SC-18). */
  BusinessInfo: undefined;
  AccountDeletionAdmin: undefined;

  // Community (P1 에서 CommunityStack 으로 이동)
  Boards: undefined;
  /**
   * - refreshKey: 변경되면 PostList가 1페이지를 silent로 다시 받아와 머지 (글쓰기/수정/삭제).
   * - patch: 특정 글의 카운트만 in-place 업데이트 (댓글/추천 등 fetch 불필요한 변경).
   *          ts로 동일 patch 중복 적용 방지.
   */
  PostList: {
    board: BoardCode;
    refreshKey?: number;
    /** 딥링크·통합검색 '더보기' 에서 넘어오는 초기 검색어/필드(서버 sfl 표기). */
    stx?: string;
    sfl?: string;
    patch?: { wr_id: number; wr_good?: number; wr_comment?: number; ts: number };
  };
  PostDetail: {
    board: BoardCode;
    wr_id: number;
    /** 목록 행의 is_secret — 상세 403 을 "비밀글" 안내로 분기하는 힌트. */
    secret?: boolean;
    /** 최신글(댓글)·알림 딥링크 — 열자마자 해당 댓글로 스크롤. */
    comment_id?: number;
    /** 댓글 수정 화면이 돌아오며 바꾸는 값 — 같은 comment_id 도 다시 스크롤하게. */
    focusKey?: number;
  };
  /** 통합검색(CM-06). */
  Search: { q?: string; board?: string } | undefined;
  /** 최신 글/댓글(CM-07). */
  Recent: undefined;
  /** 콘텐츠 페이지(CM-10) — co_id 또는 seo 슬러그. */
  Content: { co_id?: string; seo?: string };
  PostCompose: { board: BoardCode; wr_id?: number };
  /** 댓글 수정 모달(CM-05) — 알림 딥링크용. 상세 화면 안에서는 하단 입력이 수정도 맡는다. */
  CommentEdit: { board: BoardCode; wr_id: number; comment_id: number };
  /** 1:1 문의 목록(CM-11) — 회원 전용. */
  Qas: undefined;
  /** 1:1 문의 상세 — `customer_qa_answer` 푸시 탭이 여기로 온다. */
  QaDetail: { qa_id: number };
  /** 1:1 문의 작성/수정 모달 — `qa_id` 면 수정, `reply_to` 면 추가 문의. */
  QaCompose: { qa_id?: number; reply_to?: number } | undefined;
  /** 투표 목록(CM-08) — 현재 투표 + 지난 투표. */
  Polls: undefined;
  /** 투표 상세 — 투표/결과. */
  PollDetail: { po_id: number };
  /** FAQ(CM-09) — 마스터 탭, 없으면 첫 마스터. */
  Faq: { fm_id?: number } | undefined;

  // Shop (P1-C)
  /** 상품 목록(SH-02) — 카테고리(`ca_id`)·검색어(`q`)·정렬·상품 유형. 딥링크 `/shop/list.php?ca_id=` 도 여기로. */
  ProductList: { ca_id?: string; q?: string; sort?: string; it_type?: number } | undefined;
  /** 상품 검색(SH-02) — 자동완성 + 최근 검색어. */
  ProductSearch: undefined;
  /** 상품 상세(SH-03) — it_id 또는 SEO 슬러그. */
  ProductDetail: { it_id: string } | { seo: string };
  /** 기획전 목록(SH-08). */
  Events: undefined;
  /** 기획전 상세 — 딥링크 `/shop/event/{ev_id}`. */
  EventDetail: { ev_id: number };
  /** 쿠폰존(SH-09) — 게스트도 보기, 받기는 회원. */
  CouponZone: undefined;
  /** 내 쿠폰(SH-21) — 회원 전용. */
  Coupons: undefined;
  /** 포인트(SH-22) — 잔액 + 전체 내역. 회원 전용. */
  Points: undefined;
  /** 배송지 목록(SH-23) — 기본 배송지·수정·삭제. 회원 전용. */
  Addresses: undefined;
  /** 배송지 추가/수정 — `postcode` 는 우편번호 화면이 돌려준 결과(merge). */
  AddressForm: { adId?: number; postcode?: PostcodeResult } | undefined;
  /** Daum 우편번호 검색(WebView) — 결과를 `target` 화면 params.postcode 로 돌려준다. */
  Postcode: { target: PostcodeTarget; field?: PostcodeField };
  /** 주문서(SH-12) — 카트 전체 또는 선택 줄(ctIds)·바로구매(direct). 우편번호 결과는 postcode+postcodeField 로 돌아온다. */
  Checkout:
    { ctIds?: string[]; direct?: boolean; postcode?: PostcodeResult; postcodeField?: PostcodeField } | undefined;
  /** 주문 완료(SH-15) — 게스트 uid 는 여기서 guestOrderUids 에 저장한다(메모리 파라미터로만 전달). */
  OrderComplete: { odId: string; uid?: string };
  /** 주문 내역(SH-16) — 회원 전용(게스트는 로그인·비회원 조회 안내). */
  Orders: undefined;
  /** 주문 상세(SH-17) — 게스트 uid 는 파라미터 또는 기기 저장소(guestOrderUids). */
  OrderDetail: { odId: string; uid?: string };
  /** 현금영수증 발급 요청(T-P2-09) — 입장권·uid 는 파라미터에 싣지 않는다(화면이 직접 받는다). */
  CashReceipt: { odId: string };
  /** 비회원 주문조회(SH-18) — odId 미리 채우기. */
  OrderLookup: { odId?: string } | undefined;
  /** 이 기기의 비회원 주문(T-P2-10) — 기기 저장소의 주문번호 목록. */
  GuestOrders: undefined;
  /** 로그인 기기 관리(MB-10, T-P2-10) — 회원 전용. */
  Sessions: undefined;
  /** 찜한 상품(SH-20, T-P2-10) — 회원 전용, 서버 단일 소스. */
  Wishlist: undefined;
  /** 리뷰 쓰기/고치기(T-P2-02) — review 가 있으면 수정. */
  ReviewCompose: {
    itId: string;
    itName?: string;
    review?: { isId: string; subject: string; content: string; score: number };
  };
  /** 내 리뷰(SH-21, T-P2-02) — 회원 전용. */
  MyReviews: undefined;
  /** 숨긴 작성자(T-P2-05) — 리뷰·상품문의·쪽지·투표의견의 로컬 차단 목록. */
  HiddenAuthors: undefined;
  /** 상품문의 쓰기/고치기(T-P2-03) — qa 가 있으면 수정. */
  ProductQaCompose: {
    itId: string;
    itName?: string;
    qa?: { iqId: string; subject: string; question: string; secret: boolean };
  };
  /** 내 상품문의(T-P2-03) — 회원 전용. */
  MyProductQas: undefined;
  /** 쪽지함(CM-12, T-P2-04) — 회원 전용, ugc_memos 플래그로만 진입. */
  Memos: undefined;
  MemoDetail: { meId: string; box: 'recv' | 'send' };
  MemoCompose: { to?: string } | undefined;
  /** WebView PG 결제(T-P2-07) — 결제 폼은 파라미터가 아니라 메모리 실행 채널(launchId)로 받는다. */
  PgWebView: { launchId: string };
  /** 본인인증 WebView(SC-21) — 시작 URL·결과는 메모리 실행 채널(launchId)로 주고받는다. */
  IdentityCert: { launchId: string };
  /** Toss 위젯 결제(T-P1D-06) — 주문·clientKey 는 메모리 실행 채널(launchId)로 받는다. */
  TossPayment: { launchId: string };
  /** WebView PG 결제 진행(T-P2-07) — 주문서의 prepare 본문은 메모리 인계(handoffId)로 받는다. */
  PaymentRun: { handoffId: string };
};

/** `navigate('MainTabs', tabParams('MyTab'))` — 특정 탭(의 루트)으로. */
export function tabParams(tab: MainTabName): NavigatorScreenParams<MainTabsParamList> {
  return { screen: tab };
}

/** MY 탭 안의 특정 화면으로 — `navigate('MainTabs', myTabParams('Scraps'))`. */
export function myTabParams(screen: keyof MyStackParamList): NavigatorScreenParams<MainTabsParamList> {
  return { screen: 'MyTab', params: { screen } };
}

export function isMainTabName(value: unknown): value is MainTabName {
  return typeof value === 'string' && (MAIN_TAB_NAMES as readonly string[]).includes(value);
}
