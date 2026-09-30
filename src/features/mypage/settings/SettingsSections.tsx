/**
 * 설정 화면 섹션 (PLAN T-P1A-12, PRD MB-13) — 계정 · 커뮤니티 · 환경 · 약관 · 정보.
 * 정보는 "앱 버전 1.0.0 (빌드)"만(사이트 이름을 붙이면 그누보드5 버전으로 읽힌다), 약관 항목은 `legal_urls`(없는 항목은 숨김), 관리자 행은 최고관리자만.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../../entities/session/AuthContext';
import { useFeatureFlag } from '../../../entities/settings/features';
import { useSettingsQuery } from '../../../entities/settings/queries';
import { myTabParams, type RootStackParamList } from '../../../navigation/types';
import { getUserLocaleOverride, setLocale, t } from '../../../shared/i18n';
import { SHOW_DIAGNOSTICS } from '../../../shared/lib/debug/diagnostics';
import { errorMessage } from '../../../shared/lib/errors';
import { openExternalUrl } from '../../../shared/lib/openExternalUrl';
import { appVersionLabel, resolveCurrentAppVersion } from '../../../shared/lib/versionPolicy';
import { showToast } from '../../../shared/ui/Toast';
import { ThemeSetting } from './ThemeSetting';
import { Row, Section } from './SettingsRows';
import { visibleLegalEntries, type LegalEntry } from './legalLinks';
import { useNotificationPermissionRow } from './useNotificationPermissionRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function useLogout(): { busy: boolean; confirmLogout(): void } {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const run = async () => {
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      Alert.alert(t('settings.logout_failed'), errorMessage(e, t('common.error')));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };
  const confirmLogout = () =>
    Alert.alert(t('settings.logout_confirm_title'), t('settings.logout_confirm_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.logout'), style: 'destructive', onPress: () => void run() },
    ]);
  return { busy, confirmLogout };
}

export function AccountSection() {
  const { state: auth } = useAuth();
  const nav = useNavigation<Nav>();
  const { busy, confirmLogout } = useLogout();
  let rows: React.ReactNode;
  if (auth.loading) rows = <Row icon="…" label={t('common.loading')} />;
  else if (auth.member) {
    rows = (
      <>
        <Row testID="settings-member" icon="◉" label={`${auth.member.mb_nick} (${auth.member.mb_id})`} />
        <Row
          testID="settings-logout"
          icon="↩"
          label={busy ? t('settings.logout_processing') : t('auth.logout')}
          onPress={busy ? undefined : confirmLogout}
        />
        {/* 탈퇴는 재인증·안내가 있는 전용 화면에서 한다(T-P1A-07). */}
        <Row
          testID="settings-withdraw"
          icon="✕"
          danger
          label={t('settings.withdraw')}
          onPress={busy ? undefined : () => nav.navigate('Withdraw')}
        />
      </>
    );
  } else {
    rows = (
      <>
        <Row testID="settings-login" icon="↦" label={t('auth.login')} onPress={() => nav.navigate('Login')} />
        <Row icon="＋" label={t('auth.signup')} onPress={() => nav.navigate('Signup')} />
        <Row
          testID="settings-order-lookup"
          icon="🧾"
          label={t('order.guest_lookup')}
          onPress={() => nav.navigate('OrderLookup')}
        />
        <Row
          testID="settings-guest-orders"
          icon="🗂"
          label={t('order.guest_orders_title')}
          onPress={() => nav.navigate('GuestOrders')}
        />
        <Row icon="↺" label={t('settings.guest_label')} />
      </>
    );
  }
  return <Section title={t('common.account')}>{rows}</Section>;
}

/** 쪽지함은 1.1 UGC 표면 — `ugc_memos` 플래그가 켜졌을 때만 보인다. */
function MemosRow({ nav }: { nav: Nav }) {
  if (!useFeatureFlag('ugc_memos')) return null;
  return <Row testID="settings-memos" icon="✉" label={t('memo.title')} onPress={() => nav.navigate('Memos')} />;
}

function MemberRows({ nav }: { nav: Nav }) {
  return (
    <>
      <Row icon="👤" label={t('profile.title')} onPress={() => nav.navigate('Profile')} />
      <Row icon="🔑" label={t('profile.change_password')} onPress={() => nav.navigate('ChangePassword')} />
      <MemosRow nav={nav} />
      <Row testID="settings-sessions" icon="📱" label={t('sessions.title')} onPress={() => nav.navigate('Sessions')} />
      <Row icon="✎" label={t('my.posts')} onPress={() => nav.navigate('MainTabs', myTabParams('MyPosts'))} />
      <Row icon="💬" label={t('my.comments')} onPress={() => nav.navigate('MainTabs', myTabParams('MyComments'))} />
      <Row icon="★" label={t('my.scraps')} onPress={() => nav.navigate('MainTabs', myTabParams('Scraps'))} />
      <Row testID="settings-qa" icon="?" label={t('qa.title')} onPress={() => nav.navigate('Qas')} />
      <Row testID="settings-orders" icon="🧾" label={t('order.list_title')} onPress={() => nav.navigate('Orders')} />
      <Row
        testID="settings-my-reviews"
        icon="✍"
        label={t('review.mine_title')}
        onPress={() => nav.navigate('MyReviews')}
      />
      <Row
        testID="settings-my-product-qas"
        icon="❔"
        label={t('product_qa.mine_title')}
        onPress={() => nav.navigate('MyProductQas')}
      />
      <Row testID="settings-wishlist" icon="♡" label={t('wishlist.title')} onPress={() => nav.navigate('Wishlist')} />
      <Row testID="settings-coupons" icon="🎟" label={t('coupon.my_title')} onPress={() => nav.navigate('Coupons')} />
      <Row testID="settings-points" icon="Ⓟ" label={t('point.title')} onPress={() => nav.navigate('Points')} />
      <Row testID="settings-addresses" icon="📦" label={t('address.title')} onPress={() => nav.navigate('Addresses')} />
    </>
  );
}

function AdminRows({ nav }: { nav: Nav }) {
  return (
    <>
      <Row
        testID="settings-report-moderation"
        icon="!"
        label={t('settings.report_moderation')}
        onPress={() => nav.navigate('ReportModeration')}
      />
      <Row
        icon="×"
        label={t('settings.account_deletion_requests')}
        onPress={() => nav.navigate('AccountDeletionAdmin')}
      />
    </>
  );
}

export function CommunitySection() {
  const { state: auth } = useAuth();
  const nav = useNavigation<Nav>();
  return (
    <Section title={t('common.community')}>
      <Row icon="◫" label={t('settings.boards')} onPress={() => nav.navigate('Boards')} />
      <Row icon="🔍" label={t('search.title')} onPress={() => nav.navigate('Search')} />
      <Row icon="🕒" label={t('recent.title')} onPress={() => nav.navigate('Recent')} />
      <Row icon="📊" label={t('poll.title')} onPress={() => nav.navigate('Polls')} />
      <Row icon="❓" label={t('faq.title')} onPress={() => nav.navigate('Faq')} />
      {auth.member ? <MemberRows nav={nav} /> : null}
      <Row
        testID="settings-blocked"
        icon="⛔"
        label={t('settings.blocked_users')}
        onPress={() => nav.navigate('BlockedUsers')}
      />
      <Row
        testID="settings-hidden-authors"
        icon="🙈"
        label={t('hidden_authors.title')}
        onPress={() => nav.navigate('HiddenAuthors')}
      />
      {auth.member?.is_super_admin ? <AdminRows nav={nav} /> : null}
    </Section>
  );
}

export function pickLanguage(): void {
  const current = getUserLocaleOverride();
  const mark = (locale: 'ko' | 'en' | null) => (current === locale ? '  ✓' : '');
  const choose = (locale: 'ko' | 'en' | null) => () => void setLocale(locale);
  Alert.alert(t('language.pick_title'), undefined, [
    { text: t('language.system_default') + mark(null), onPress: choose(null) },
    { text: t('language.korean') + mark('ko'), onPress: choose('ko') },
    { text: t('language.english') + mark('en'), onPress: choose('en') },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}

export function EnvironmentSection() {
  const nav = useNavigation<Nav>();
  const permissionRow = useNotificationPermissionRow();
  return (
    <Section title={t('common.environment')}>
      <Row testID="settings-push" icon="🔔" label={permissionRow.label} onPress={permissionRow.onPress} />
      <Row icon="📜" label={t('settings.notif_history')} onPress={() => nav.navigate('Notifications')} />
      <Row testID="settings-language" icon="🌐" label={t('settings.language')} onPress={pickLanguage} />
      <ThemeSetting />
      {SHOW_DIAGNOSTICS ? <Row icon="📋" label={t('settings.app_log')} onPress={() => nav.navigate('AppLog')} /> : null}
    </Section>
  );
}

const LEGAL_LABEL_KEYS: Record<LegalEntry['kind'], string> = {
  terms: 'legal.terms_title',
  privacy: 'legal.privacy_title',
  account_deletion: 'legal.account_deletion_title',
  refund: 'legal.refund_title',
};
const LEGAL_ICONS: Record<LegalEntry['kind'], string> = {
  terms: '📄',
  privacy: '🔒',
  account_deletion: '↩',
  refund: '💳',
};

export function LegalSection() {
  const nav = useNavigation<Nav>();
  const entries = visibleLegalEntries(useSettingsQuery().data);
  const open = (entry: LegalEntry) => {
    if (entry.mode === 'builtin') {
      nav.navigate('LegalText', { kind: entry.kind === 'privacy' ? 'privacy' : 'terms' });
      return;
    }
    if (entry.mode === 'url') {
      void openExternalUrl(entry.url).then((opened) => {
        if (!opened) showToast(t('legal.open_failed'), 'error');
      });
    }
  };
  return (
    <Section title={t('common.terms_policy')}>
      {entries.map((entry) => (
        <Row
          key={entry.kind}
          testID={`settings-legal-${entry.kind}`}
          icon={LEGAL_ICONS[entry.kind]}
          label={t(LEGAL_LABEL_KEYS[entry.kind])}
          onPress={() => open(entry)}
        />
      ))}
      <Row
        testID="settings-licenses"
        icon="⚖"
        label={t('settings.open_source')}
        onPress={() => nav.navigate('OpenSourceLicenses')}
      />
      <Row
        testID="settings-business-info"
        icon="🏢"
        label={t('company.title')}
        onPress={() => nav.navigate('BusinessInfo')}
      />
    </Section>
  );
}

/**
 * "앱 버전 1.0.0 (12)" — 사이트 이름을 붙이면 "그누보드5 · 버전 1.0.0" 처럼 그누보드5(5.x) 프로그램의 버전으로
 * 읽혀서, 이 줄은 앱 버전만 보여 준다(사이트 이름은 홈 제목줄·서랍에 있다).
 */
export function InfoSection() {
  const version = resolveCurrentAppVersion(Constants.expoConfig?.version, Constants.nativeAppVersion);
  return (
    <Section title={t('common.info')}>
      <Row
        testID="settings-about"
        icon="ⓘ"
        label={t('settings.app_version')}
        value={appVersionLabel(version, Application.nativeBuildVersion)}
      />
    </Section>
  );
}
