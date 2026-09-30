import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { SPACING, TYPO, useColors } from '../../../shared/ui/tokens/theme';
import { routeParamRecord } from '../../../shared/lib/routeParams';
import { t, getLocale } from '../../../shared/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'LegalText'>;

const TERMS_KO = [
  {
    h: '제1조 (목적)',
    p: '이 약관은 본 앱(이하 "앱")의 이용 조건과 절차, 회사와 이용자의 권리·의무·책임사항 등을 정함을 목적으로 합니다.',
  },
  {
    h: '제2조 (회원가입과 이용)',
    p: '이용자는 본 약관에 동의함으로써 회원가입을 신청할 수 있으며, 회사는 이용 신청자가 본 약관에서 정한 사항을 위반하지 않는 한 회원가입을 승낙합니다.',
  },
  {
    h: '제3조 (서비스 제공)',
    p: '앱은 게시판·댓글 등 커뮤니티 기능, 1:1 문의, 상품 조회·주문·결제, 알림 수신 기능을 무상 또는 유상으로 제공합니다.',
  },
  {
    h: '제4조 (이용자의 의무)',
    p: '이용자는 타인의 권리를 침해하거나 법령을 위반하는 게시물을 작성·공유해서는 안 됩니다.',
  },
  {
    h: '제5조 (금지 콘텐츠와 커뮤니티 안전)',
    p: '이용자는 스팸·광고성 도배, 욕설·비방·괴롭힘, 혐오 또는 차별 표현, 음란·성적 콘텐츠, 불법 정보, 사칭, 개인정보 노출, 권리 침해 콘텐츠를 게시할 수 없습니다. 회사는 신고 접수, 자동 탐지, 운영자 검토를 통해 해당 콘텐츠나 계정을 숨김, 삭제, 이용 제한 또는 신고 처리할 수 있습니다.',
  },
  {
    h: '제6조 (서비스의 변경 및 중단)',
    p: '회사는 운영상 또는 기술상의 필요에 따라 서비스의 일부 또는 전부를 변경하거나 중단할 수 있습니다.',
  },
  {
    h: '제7조 (계정 탈퇴)',
    p: '이용자는 언제든지 회원 탈퇴를 요청할 수 있습니다. 탈퇴 요청 즉시 로그인과 푸시 알림은 중지되며, 계정은 30일 동안 복구 가능 상태로 보관된 뒤 관련 법령에 따라 영구 삭제됩니다.',
  },
  {
    h: '제8조 (책임 제한)',
    p: '천재지변, 전기 통신 서비스 사업자의 서비스 중지, 이용자의 귀책 사유로 인해 발생한 손해에 대해 회사는 책임을 지지 않습니다.',
  },
  {
    h: '제9조 (약관의 변경)',
    p: '본 약관은 관련 법령 개정 등의 사유로 변경될 수 있으며, 변경되는 경우 앱 내 공지를 통해 14일 이전에 안내합니다.',
  },
];

const TERMS_EN = [
  {
    h: 'Article 1 (Purpose)',
    p: 'These terms set out the conditions for using this app, along with rights, duties, and responsibilities of the company and users.',
  },
  {
    h: 'Article 2 (Sign-up and Use)',
    p: 'By agreeing to these terms, you may apply for membership. The company accepts the application unless it violates these terms.',
  },
  {
    h: 'Article 3 (Service)',
    p: 'The app provides community boards and comments, 1:1 inquiries, product browsing, ordering and payment, and notifications, either free or paid.',
  },
  {
    h: 'Article 4 (User Obligations)',
    p: "Users must not post content that infringes on others' rights or violates the law.",
  },
  {
    h: 'Article 5 (Prohibited Content and Community Safety)',
    p: 'Users must not post spam, repetitive advertising, abuse, harassment, hateful or discriminatory content, sexual content, illegal information, impersonation, personal data exposure, or content that infringes rights. The company may hide, remove, restrict, or otherwise moderate content or accounts based on reports, automated signals, and admin review.',
  },
  {
    h: 'Article 6 (Service Change and Suspension)',
    p: 'The company may change or suspend part or all of the service due to operational or technical reasons.',
  },
  {
    h: 'Article 7 (Account Deletion)',
    p: 'Users may request account deletion at any time. Sign-in and push notifications stop immediately, and the account remains recoverable for 30 days before permanent deletion under applicable law.',
  },
  {
    h: 'Article 8 (Limitation of Liability)',
    p: 'The company is not liable for damage caused by force majeure, telecom service disruption, or user fault.',
  },
  {
    h: 'Article 9 (Changes to Terms)',
    p: 'These terms may be amended due to changes in law; changes are announced in-app at least 14 days in advance.',
  },
];

const PRIVACY_KO = [
  {
    h: '1. 수집하는 개인정보 항목',
    p: '회원가입 시 아이디, 비밀번호, 닉네임, 이름, 이메일을 수집합니다. 1:1 문의 등 일부 화면에서는 답변 수신을 위해 이메일·휴대폰 번호를 추가로 입력받을 수 있습니다(운영자 설정에 따름). 앱 이용 과정에서 게시글·댓글 내용과 첨부 파일, 1:1 문의 내용과 첨부, 주문·배송·결제 내역, 푸시 토큰, IP 주소, 기기 정보, 오류 로그가 저장·처리될 수 있습니다.',
  },
  {
    h: '2. 수집·이용 목적',
    p: '회원 식별 및 인증, 게시물·문의 등록과 표시, 주문·결제·배송 처리, 알림 발송, 서비스 제공·개선, 장애 분석, 부정 이용 방지, 고객 문의 응대 목적으로 사용합니다.',
  },
  {
    h: '3. 저장 위치와 보호 방식',
    p: '인증 토큰은 네이티브 앱에서 기기 보안 저장소에 저장하며, 웹에서는 브라우저 저장소에 저장합니다. 게시물·문의·주문 데이터는 운영 서버 데이터베이스에 저장되고, 화면 표시를 위한 임시 캐시가 기기에 남을 수 있습니다.',
  },
  {
    h: '4. 보유 및 이용기간',
    p: '회원 탈퇴 요청 즉시 로그인 세션과 푸시 토큰을 삭제하고, 계정은 30일 동안 복구 가능 상태로 보관한 뒤 영구 삭제합니다. 단 관계 법령에서 보존 의무가 있는 경우 해당 기간 동안 안전하게 보관 후 파기합니다.',
  },
  {
    h: '5. 제3자 제공 및 처리 위탁',
    p: '원칙적으로 이용자의 개인정보를 제3자에게 판매하거나 임의 제공하지 않습니다. 다만 푸시 알림 발송을 위해 Expo Push Service에 푸시 토큰이 전송될 수 있고, 오류 분석을 위해 Sentry에 비식별화된 크래시 정보가 전송될 수 있습니다. 앱 배포 과정에서는 Google Play 등 앱스토어의 정책이 적용됩니다.',
  },
  {
    h: '6. 이용자의 권리',
    p: '이용자는 언제든지 본인의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 이는 앱 설정 화면 또는 고객센터를 통해 가능합니다.',
  },
  {
    h: '7. 안전성 확보 조치',
    p: '비밀번호는 단방향 해시로 저장되며, 운영 서버와의 통신은 HTTPS로 암호화합니다. 크래시 리포트에는 계정 정보, 토큰, 게시물·문의 본문 등 민감한 값이 전송되지 않도록 필터링합니다.',
  },
  {
    h: '8. 개인정보 보호책임자',
    p: '문의: 앱 내 "버그 신고" 또는 회사 공식 이메일을 통해 접수해주세요. 접수 후 5영업일 이내 답변드립니다.',
  },
];

const PRIVACY_EN = [
  {
    h: '1. Personal Data Collected',
    p: 'Sign-up collects ID, password, nickname, name, and email. Some screens, such as 1:1 inquiries, may additionally ask for an email address or phone number so replies can be delivered, depending on the operator settings. During use, post and comment content and attachments, 1:1 inquiries and their attachments, order, shipping and payment records, push tokens, IP address, device info, and error logs may be stored and processed.',
  },
  {
    h: '2. Purpose of Use',
    p: 'For account identification and authentication, publishing and displaying posts and inquiries, processing orders, payments and shipping, sending notifications, service provision and improvement, fault analysis, abuse prevention, and customer support.',
  },
  {
    h: '3. Storage and Protection',
    p: 'Auth tokens are stored in the device secure storage on native apps and browser storage on web. Posts, inquiries and order data are stored in the service database; a temporary cache for rendering may remain on the device.',
  },
  {
    h: '4. Retention',
    p: 'When deletion is requested, sign-in sessions and push tokens are removed immediately. The account is kept in a recoverable state for 30 days, then permanently deleted unless retention is required by law.',
  },
  {
    h: '5. Third-party Sharing',
    p: 'We do not sell personal data. Push tokens may be sent to Expo Push Service to deliver notifications, and anonymized crash data may be sent to Sentry. App store policies (e.g. Google Play) apply during distribution.',
  },
  {
    h: '6. User Rights',
    p: 'You may request access, correction, deletion, or processing suspension of your personal data at any time, via the in-app settings or customer support.',
  },
  {
    h: '7. Safeguards',
    p: 'Passwords are stored as one-way hashes. Communication with the server is encrypted via HTTPS. Crash reports are filtered to exclude account info, tokens, and post or inquiry content.',
  },
  {
    h: '8. Data Protection Contact',
    p: 'Reach us via the in-app "Bug report" or the company email. We respond within 5 business days.',
  },
];

export function LegalTextScreen({ route, navigation }: Props) {
  const colors = useColors();
  const kind = routeParamRecord(route.params).kind;
  const isValidKind = kind === 'terms' || kind === 'privacy';
  const isTerms = kind === 'terms';
  const isKorean = getLocale() === 'ko';
  const sections = !isValidKind ? [] : isTerms ? (isKorean ? TERMS_KO : TERMS_EN) : isKorean ? PRIVACY_KO : PRIVACY_EN;
  const title = !isValidKind ? t('common.error') : isTerms ? t('legal.terms_title') : t('legal.privacy_title');
  const updated = isValidKind ? (isKorean ? '2026.05.22 시행' : 'Effective 2026.05.22') : '';

  const goBackOrHome = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TopAppBar title={title} leftIcon="←" onLeftPress={goBackOrHome} />
      {isValidKind ? (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={[s.heading, { color: colors.onSurface }]}>{title}</Text>
          <Text style={[s.updated, { color: colors.outline }]}>{updated}</Text>
          <View style={s.gap} />
          {sections.map((sec) => (
            <View key={sec.h} style={s.section}>
              <Text style={[s.h, { color: colors.onSurface }]}>{sec.h}</Text>
              <Text style={[s.p, { color: colors.onSurfaceVariant }]}>{sec.p}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={s.center}>
          <Text style={[s.errorText, { color: colors.error }]}>{t('common.error')}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: SPACING.containerMargin, paddingBottom: 60 },
  heading: { ...TYPO.headlineLg, fontSize: 22 },
  updated: { fontSize: 12, marginTop: 4 },
  gap: { height: 16 },
  section: { marginBottom: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.containerMargin },
  errorText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  h: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  p: { fontSize: 13, lineHeight: 22 },
});
