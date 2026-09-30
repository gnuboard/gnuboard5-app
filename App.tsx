import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initSentry, Sentry } from './src/app/sentry';
import { ErrorBoundary } from './src/app/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/shared/ui/theme/ThemeProvider';
import { WebFrame } from './src/shared/ui/WebFrame';
import { useAndroidChannels } from './src/features/notifications/useAndroidChannels';
import {
  setupNotificationListener,
  teardownNotificationListener,
} from './src/features/notifications/notificationListener';
import { checkAndPromptOtaUpdate } from './src/features/update/otaUpdateChecker';
import { SHOW_DIAGNOSTICS } from './src/shared/lib/debug/diagnostics';

import { MainTabs } from './src/navigation/MainTabs';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { SignupScreen } from './src/features/auth/signup/SignupScreen';
import { ForgotPasswordScreen } from './src/features/auth/forgot/ForgotPasswordScreen';
import { WithdrawScreen } from './src/features/auth/withdraw/WithdrawScreen';
import { ProfileScreen } from './src/features/mypage/profile/ProfileScreen';
import { ChangePasswordScreen } from './src/features/mypage/profile/ChangePasswordScreen';
import { SignupResultScreen } from './src/features/auth/signup/SignupResultScreen';
import { SocialSignupScreen } from './src/features/auth/social/SocialSignupScreen';
import { SocialLinkScreen } from './src/features/auth/social/SocialLinkScreen';
import { LegalTextScreen } from './src/features/mypage/legal/LegalTextScreen';
import { BoardsScreen } from './src/features/community/boards/BoardsScreen';
import { NotificationsScreen } from './src/features/notifications/inbox/NotificationsScreen';
import { AppLogScreen } from './src/features/mypage/settings/AppLogScreen';
import { OpenSourceLicensesScreen } from './src/features/mypage/settings/OpenSourceLicensesScreen';
import { BusinessInfoScreen } from './src/features/mypage/settings/BusinessInfoScreen';
import { ReportModerationScreen } from './src/features/mypage/admin/ReportModerationScreen';
import { BlockedUsersScreen } from './src/features/community/moderation/BlockedUsersScreen';
import { ContentScreen } from './src/features/community/content/ContentScreen';
import { RecentScreen } from './src/features/community/recent/RecentScreen';
import { SearchScreen } from './src/features/community/search/SearchScreen';
import { AccountDeletionAdminScreen } from './src/features/mypage/admin/AccountDeletionAdminScreen';
import { OnboardingScreen, isOnboardingDone } from './src/features/onboarding/OnboardingScreen';
import { PostListScreen } from './src/features/community/posts/PostListScreen';
import { PostDetailScreen } from './src/features/community/posts/PostDetailScreen';
import { CommentEditScreen } from './src/features/community/comments/CommentEditScreen';
import { PostComposeScreen } from './src/features/community/compose/PostComposeScreen';
import { QasScreen } from './src/features/community/qas/QasScreen';
import { QaDetailScreen } from './src/features/community/qas/QaDetailScreen';
import { QaComposeScreen } from './src/features/community/qas/QaComposeScreen';
import { PollsScreen } from './src/features/community/polls/PollsScreen';
import { PollDetailScreen } from './src/features/community/polls/PollDetailScreen';
import { FaqScreen } from './src/features/community/faq/FaqScreen';
import { ProductListScreen } from './src/features/shop/catalog/ProductListScreen';
import { ProductSearchScreen } from './src/features/shop/catalog/ProductSearchScreen';
import { ProductDetailScreen } from './src/features/shop/productDetail/ProductDetailScreen';
import { EventDetailScreen } from './src/features/shop/events/EventDetailScreen';
import { EventsScreen } from './src/features/shop/events/EventsScreen';
import { CouponsScreen } from './src/features/shop/coupons/CouponsScreen';
import { CouponZoneScreen } from './src/features/shop/coupons/CouponZoneScreen';
import { AddressesScreen } from './src/features/shop/addresses/AddressesScreen';
import { AddressFormScreen } from './src/features/shop/addresses/AddressFormScreen';
import { PointsScreen } from './src/features/shop/points/PointsScreen';
import { PostcodeScreen } from './src/features/webview/PostcodeScreen';
import { CheckoutScreen } from './src/features/checkout/CheckoutScreen';
import { OrderCompleteScreen } from './src/features/orders/OrderCompleteScreen';
import { PaymentRecoveryHost } from './src/features/payment/PaymentRecoveryHost';
import { PaymentRunScreen } from './src/features/payment/PaymentRunScreen';
import { PgWebViewScreen } from './src/features/payment/PgWebViewScreen';
import { IdentityCertScreen } from './src/features/auth/cert/IdentityCertScreen';
import { TossPaymentScreen } from './src/features/payment/TossPaymentScreen';
import { OrderDetailScreen } from './src/features/orders/detail/OrderDetailScreen';
import { CashReceiptScreen } from './src/features/orders/cashReceipt/CashReceiptScreen';
import { SessionsScreen } from './src/features/mypage/sessions/SessionsScreen';
import { WishlistScreen } from './src/features/shop/wishlist/WishlistScreen';
import { MyReviewsScreen } from './src/features/shop/reviews/MyReviewsScreen';
import { HiddenAuthorsScreen } from './src/features/mypage/moderation/HiddenAuthorsScreen';
import { MyProductQasScreen } from './src/features/shop/productQa/MyProductQasScreen';
import { MemoComposeScreen } from './src/features/community/memos/MemoComposeScreen';
import { MemoDetailScreen } from './src/features/community/memos/MemoDetailScreen';
import { MemosScreen } from './src/features/community/memos/MemosScreen';
import { ProductQaComposeScreen } from './src/features/shop/productQa/ProductQaComposeScreen';
import { ReviewComposeScreen } from './src/features/shop/reviews/ReviewComposeScreen';
import { GuestOrdersScreen } from './src/features/orders/guestLookup/GuestOrdersScreen';
import { OrderLookupScreen } from './src/features/orders/guestLookup/OrderLookupScreen';
import { OrdersScreen } from './src/features/orders/list/OrdersScreen';

import { AuthProvider, useAuth } from './src/entities/session/AuthContext';
import { registerAuthHooks } from './src/entities/session/authHooks';
import { communityAuthHooks } from './src/features/community/moderation/communityAuthHooks';
import { notificationAuthHooks } from './src/features/notifications/authHooks';
import { cartAuthHooks } from './src/features/shop/cart/authHooks';
import { initCartIdStore } from './src/features/shop/cart/cartId';
import { OfflineBanner } from './src/shared/ui/OfflineBanner';
import { ToastHost } from './src/shared/ui/Toast';
import { SnackbarHost } from './src/shared/ui/Snackbar';
import { ForceUpdateGate } from './src/features/update/ForceUpdateGate';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from './src/shared/query/queryClient';
import { loadPersistedLocale, useLocale } from './src/shared/i18n';
import { linkingConfig } from './src/navigation/linkingConfig';
import { COLORS, DARK_COLORS } from './src/shared/ui/tokens/theme';
import { flushPendingNavigation, navRef } from './src/navigation/navRef';
import { StackScreenLayout } from './src/navigation/StackScreenLayout';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const sentryEnabled = initSentry();

// 도메인별 인증 훅 등록 — AuthContext 는 도메인을 모른다 (PLAN §1.2-6).
registerAuthHooks(communityAuthHooks);
registerAuthHooks(notificationAuthHooks);
registerAuthHooks(cartAuthHooks);
initCartIdStore();

function AppShell() {
  const { isDark: dark, hydrated: themeReady } = useTheme();
  const [initialRoute, setInitialRoute] = React.useState<'Onboarding' | 'MainTabs' | null>(null);
  const [localeReady, setLocaleReady] = React.useState(false);

  useLocale();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadPersistedLocale();
        const done = await isOnboardingDone();
        if (!alive) return;
        setInitialRoute(done ? 'MainTabs' : 'Onboarding');
      } catch {
        if (!alive) return;
        setInitialRoute('Onboarding');
      } finally {
        if (alive) setLocaleReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void checkAndPromptOtaUpdate();
  }, []);

  const palette = dark ? DARK_COLORS : COLORS;
  const navTheme = dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: palette.background } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: palette.background } };

  // 테마 선호도 복원 전에는 스피너 유지 — 사용자가 '다크'를 골랐는데 라이트가 번쩍이는 FOUC 방지.
  if (!localeReady || !initialRoute || !themeReady) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.background,
          }}
        >
          <ActivityIndicator color={palette.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {/* 키보드 높이 추적(react-native-keyboard-controller) — shared/ui/KeyboardScreen 이 쓴다. */}
      <KeyboardProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <AuthProvider>
            <AppMaintenanceEffects />
            <WebFrame>
              <ForceUpdateGate>
                <OfflineBanner />
                <ToastHost />
                <SnackbarHost />
                <NavigationContainer
                  ref={navRef}
                  theme={navTheme}
                  linking={linkingConfig}
                  onReady={flushPendingNavigation}
                >
                  <StatusBar style={dark ? 'light' : 'dark'} />
                  <Stack.Navigator
                    initialRouteName={initialRoute}
                    screenLayout={StackScreenLayout}
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: palette.background },
                    }}
                  >
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    <Stack.Screen name="MainTabs" component={MainTabs} />
                    {/* 모달 그룹 (ARCH §4.1) — 인증·법적 고지·작성 화면 */}
                    <Stack.Group screenOptions={{ presentation: 'modal', animation: 'slide_from_bottom' }}>
                      <Stack.Screen name="Login" component={LoginScreen} />
                      <Stack.Screen name="Signup" component={SignupScreen} />
                      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
                      <Stack.Screen name="Profile" component={ProfileScreen} />
                      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                      <Stack.Screen name="SignupResult" component={SignupResultScreen} />
                      <Stack.Screen name="SocialSignup" component={SocialSignupScreen} />
                      <Stack.Screen name="SocialLink" component={SocialLinkScreen} />
                      <Stack.Screen name="LegalText" component={LegalTextScreen} />
                    </Stack.Group>
                    <Stack.Screen name="Notifications" component={NotificationsScreen} />
                    {SHOW_DIAGNOSTICS ? <Stack.Screen name="AppLog" component={AppLogScreen} /> : null}
                    <Stack.Screen name="ReportModeration" component={ReportModerationScreen} />
                    <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
                    <Stack.Screen name="OpenSourceLicenses" component={OpenSourceLicensesScreen} />
                    <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
                    <Stack.Screen name="AccountDeletionAdmin" component={AccountDeletionAdminScreen} />
                    <Stack.Screen name="Boards" component={BoardsScreen} />
                    <Stack.Screen name="PostList" component={PostListScreen} />
                    <Stack.Screen name="Search" component={SearchScreen} />
                    <Stack.Screen name="Recent" component={RecentScreen} />
                    <Stack.Screen name="Content" component={ContentScreen} />
                    <Stack.Screen name="PostDetail" component={PostDetailScreen} />
                    <Stack.Screen name="Qas" component={QasScreen} />
                    <Stack.Screen name="QaDetail" component={QaDetailScreen} />
                    <Stack.Screen name="Polls" component={PollsScreen} />
                    <Stack.Screen name="PollDetail" component={PollDetailScreen} />
                    <Stack.Screen name="Faq" component={FaqScreen} />
                    <Stack.Screen name="ProductList" component={ProductListScreen} />
                    <Stack.Screen name="ProductSearch" component={ProductSearchScreen} />
                    <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
                    <Stack.Screen name="Events" component={EventsScreen} />
                    <Stack.Screen name="EventDetail" component={EventDetailScreen} />
                    <Stack.Screen name="CouponZone" component={CouponZoneScreen} />
                    <Stack.Screen name="Coupons" component={CouponsScreen} />
                    <Stack.Screen name="Points" component={PointsScreen} />
                    <Stack.Screen name="Addresses" component={AddressesScreen} />
                    <Stack.Screen name="AddressForm" component={AddressFormScreen} />
                    <Stack.Screen name="Postcode" component={PostcodeScreen} />
                    <Stack.Screen name="Checkout" component={CheckoutScreen} />
                    <Stack.Screen
                      name="OrderComplete"
                      component={OrderCompleteScreen}
                      options={{ gestureEnabled: false }}
                    />
                    <Stack.Screen name="Orders" component={OrdersScreen} />
                    <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
                    <Stack.Screen name="CashReceipt" component={CashReceiptScreen} />
                    <Stack.Screen name="OrderLookup" component={OrderLookupScreen} />
                    <Stack.Screen name="GuestOrders" component={GuestOrdersScreen} />
                    <Stack.Screen name="Sessions" component={SessionsScreen} />
                    <Stack.Screen name="Wishlist" component={WishlistScreen} />
                    <Stack.Screen name="ReviewCompose" component={ReviewComposeScreen} />
                    <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
                    <Stack.Screen name="HiddenAuthors" component={HiddenAuthorsScreen} />
                    <Stack.Screen name="ProductQaCompose" component={ProductQaComposeScreen} />
                    <Stack.Screen name="MyProductQas" component={MyProductQasScreen} />
                    <Stack.Screen name="Memos" component={MemosScreen} />
                    <Stack.Screen name="MemoDetail" component={MemoDetailScreen} />
                    <Stack.Screen name="MemoCompose" component={MemoComposeScreen} />
                    <Stack.Screen name="PaymentRun" component={PaymentRunScreen} options={{ gestureEnabled: false }} />
                    <Stack.Screen
                      name="PgWebView"
                      component={PgWebViewScreen}
                      options={{ gestureEnabled: false, presentation: 'fullScreenModal' }}
                    />
                    <Stack.Screen
                      name="IdentityCert"
                      component={IdentityCertScreen}
                      options={{ gestureEnabled: false, presentation: 'fullScreenModal' }}
                    />
                    <Stack.Screen
                      name="TossPayment"
                      component={TossPaymentScreen}
                      options={{ gestureEnabled: false, presentation: 'fullScreenModal' }}
                    />
                    <Stack.Screen
                      name="PostCompose"
                      component={PostComposeScreen}
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="CommentEdit"
                      component={CommentEditScreen}
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                      name="QaCompose"
                      component={QaComposeScreen}
                      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                  </Stack.Navigator>
                  <PaymentRecoveryHost />
                </NavigationContainer>
              </ForceUpdateGate>
            </WebFrame>
          </AuthProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

function reportBoundaryError(error: Error): void {
  if (sentryEnabled) Sentry.captureException(error);
}

/** 루트: 테마(라이트/다크/시스템, AsyncStorage 복원) → 전역 ErrorBoundary → 셸. */
function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary onError={reportBoundaryError}>
        <AppShell />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function AppMaintenanceEffects() {
  const { state } = useAuth();
  // Android 알림 채널 4종을 만들고 cf_title·로케일 변경 시 이름만 갱신한다(T-P1A-10).
  useAndroidChannels();

  useEffect(() => {
    if (state.loading) return undefined;
    setupNotificationListener();
    return () => teardownNotificationListener();
  }, [state.loading]);

  return null;
}

export default sentryEnabled ? Sentry.wrap(App) : App;
