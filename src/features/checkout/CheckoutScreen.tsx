/**
 * 주문서 (PLAN T-P1D-02/03, PRD SH-12) — 카트(전체·선택 줄·바로구매)로 주문자·수령인·결제 수단·할인·약관을 받아 주문한다.
 *  - 결제 수단은 `GET /shop/payment/config` ∩ 앱 지원. Toss 결제 화면(T-P1D-06)이 붙기 전에는 무통장만 연다.
 *  - 제출: 로컬 검증 → `order-stock` 재확인 → 무통장 `POST /shop/orders`(client_uid 멱등) → OrderComplete(게스트 uid 전달).
 *  - 금액은 미리보기(pricing) — 서버가 최종 계산한다. 배송비는 카트의 서버 값.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useAddressesQuery } from '../../entities/address/api';
import { checkOrderStock, getCart, isCartChanged } from '../../entities/cart/api';
import { cartKeys } from '../../entities/cart/queries';
import { useMyCouponsQuery, useSendCostCouponsQuery } from '../../entities/coupon/queries';
import { createOrder, isBankAccountRejected } from '../../entities/payment/api';
import { putCheckoutHandoff, type PgCheckoutHandoff } from '../../entities/payment/checkoutHandoff';
import { paymentConfigKeys, usePaymentConfigQuery } from '../../entities/payment/config';
import { usePointSummaryQuery } from '../../entities/point/api';
import { useShopPolicyQuery } from '../../entities/policy/api';
import { useAuth } from '../../entities/session/AuthContext';
import { useSettingsQuery } from '../../entities/settings/queries';
import type { PostcodeField, RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { errorMessage } from '../../shared/lib/errors';
import { formatWon } from '../../shared/lib/money';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorState } from '../../shared/ui/ErrorState';
import { Field } from '../../shared/ui/Field';
import { Skeleton } from '../../shared/ui/Skeleton';
import { showToast } from '../../shared/ui/Toast';
import { TopAppBar } from '../../shared/ui/TopAppBar';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../shared/ui/tokens/primitive';
import {
  AddressFields,
  AgreementBlock,
  DiscountBlock,
  PaymentBlock,
  RecipientBlock,
  SummaryBlock,
  type AddressProps,
} from './CheckoutSections';
import { CheckoutCard, OrderItems } from './CheckoutCard';
import { availableMethods, isWebViewPg, type CheckoutMethod } from './methods';
import { validateOrderForm, type OrderFormValues } from './orderForm.schema';
import { buildCheckoutIntent, shownOrderCtIds } from './payload';
import { buildOrderPreview, type OrderPreview } from './pricing';
import { addressToOrderAddress, useCheckoutForm } from './useCheckoutForm';
import { KeyboardScreen } from '../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type Patch = (next: Partial<OrderFormValues>) => void;

/**
 * Toss 위젯(T-P1D-06)으로 결제할 수 있는가 — 상점 PG 가 toss 이고 서버가 client_key 를 줄 때만. 아니면 PG 수단을 보여 주지
 * 않는다(누르면 막히는 버튼을 두지 않는다).
 */
export function tossCheckoutReady(config: Data['config']['data']): boolean {
  return config?.pg_service === 'toss' && !!config.client?.client_key;
}

function useCheckoutData(ctIds: string[] | undefined, direct: boolean | undefined, isMember: boolean) {
  const cart = useQuery({
    queryKey: [...cartKeys.root, 'checkout', ctIds?.join(',') ?? '', direct ? 1 : 0],
    // 장바구니 전부로 여는 주문서는 웹 · 다른 기기의 상품도 모아 보여 주고, 보여 준 줄만 주문한다(shownOrderCtIds).
    queryFn: () => getCart({ ctIds, direct, gather: true }),
  });
  return {
    cart,
    config: usePaymentConfigQuery(),
    policy: useShopPolicyQuery(),
    coupons: useMyCouponsQuery(isMember),
    points: usePointSummaryQuery(isMember),
    addresses: useAddressesQuery(isMember),
  };
}

type Data = ReturnType<typeof useCheckoutData>;

/**
 * 결제 수단 — 무통장은 항상(계좌가 있을 때), PG 수단은 Toss 화면(T-P1D-06)이 준비됐거나 `webview_pg` 플래그가 켜지고
 * 상점 PG 가 KCP·이니시스·나이스페이일 때만(WebView 결제, T-P2-07).
 */
/** 고른 입금 계좌 — 지금 목록에 없으면(안 골랐거나 관리자가 그사이 바꿨다) 첫 계좌. */
export function pickBankAccount(selected: string, accounts: readonly string[]): string {
  return accounts.includes(selected) ? selected : (accounts[0] ?? '');
}

export function checkoutMethods(config: Data['config']['data'], webviewPg = false): CheckoutMethod[] {
  const pgWebView = webviewPg && isWebViewPg(config?.pg_service);
  return availableMethods(config, { webviewPg }).filter(
    (method) => method.kind === 'bank' || tossCheckoutReady(config) || pgWebView,
  );
}

export interface PgContext {
  webview: boolean;
  /** Toss 위젯 client_key — 있으면 Toss 경로(T-P1D-06). */
  tossClientKey: string | null;
  testMode: boolean;
  shopName: string;
}

interface SubmitContext {
  props: Props;
  clientUid: string;
  isMember: boolean;
  pg: PgContext;
  /** 주문서가 보여 준 카트 줄(shownOrderCtIds) — 재고 확인 · 주문 · 결제 준비가 이 줄만 쓴다. */
  shownCtIds: string[] | undefined;
}

async function placeBankOrder(ctx: SubmitContext, values: OrderFormValues, method: CheckoutMethod, qc: QueryClient) {
  const { direct } = ctx.props.route.params ?? {};
  const intent = buildCheckoutIntent(values, method, {
    isMember: ctx.isMember,
    clientUid: ctx.clientUid,
    ctIds: ctx.shownCtIds,
    direct,
  });
  const order = await createOrder(intent.body);
  // 먼저 완료 화면으로(게스트 uid 저장은 그 화면) — 카트 갱신은 기다리지 않는다.
  ctx.props.navigation.replace('OrderComplete', { odId: order.odId, uid: order.uid });
  void qc.invalidateQueries({ queryKey: cartKeys.root });
}

/** WebView PG — prepare 본문(게스트 비밀번호 포함)은 메모리 인계로, 화면에는 id 만. */
function startPgPayment(ctx: SubmitContext, values: OrderFormValues, method: CheckoutMethod) {
  const { direct } = ctx.props.route.params ?? {};
  const intent = buildCheckoutIntent(values, method, {
    isMember: ctx.isMember,
    clientUid: ctx.clientUid,
    ctIds: ctx.shownCtIds,
    direct,
  });
  const handoffId = putCheckoutHandoff({
    body: { ...intent.body } as Record<string, unknown>,
    method: method.value as PgCheckoutHandoff['method'],
    settleCase: method.settleCase,
    testMode: ctx.pg.testMode,
    shopName: ctx.pg.shopName,
    // WebView PG 플래그가 켜진 KCP·이니시스·나이스페이가 아니면 Toss 위젯.
    provider: ctx.pg.webview ? 'pgWebView' : 'toss',
    clientKey: ctx.pg.webview ? undefined : (ctx.pg.tossClientKey ?? undefined),
  });
  ctx.props.navigation.navigate('PaymentRun', { handoffId });
}

function useSubmitOrder(ctx: SubmitContext, offered: readonly CheckoutMethod[]) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { direct } = ctx.props.route.params ?? {};
  const submit = async (values: OrderFormValues) => {
    const result = validateOrderForm(values, ctx.isMember);
    if (!result.ok) return showToast(t(result.messageKey), 'error');
    if (!offered.some((method) => method.value === result.method.value)) {
      return showToast(t('checkout.err_method'), 'error');
    }
    const viaWebView = result.method.kind !== 'bank' && ctx.pg.webview;
    const viaToss = result.method.kind !== 'bank' && !viaWebView && ctx.pg.tossClientKey !== null;
    if (result.method.kind !== 'bank' && !viaWebView && !viaToss) return showToast(t('checkout.toss_soon'), 'info');
    setBusy(true);
    try {
      await checkOrderStock({ ctIds: ctx.shownCtIds, direct });
      if (viaWebView || viaToss) startPgPayment(ctx, result.values, result.method);
      else await placeBankOrder(ctx, result.values, result.method, qc);
    } catch (error) {
      if (isCartChanged(error)) {
        // 웹 · 다른 기기에서 장바구니가 바뀌었다 — 입력은 두고 줄만 다시 불러온다(보내는 줄도 따라 바뀐다).
        showToast(t('checkout.cart_changed'), 'error');
        void qc.invalidateQueries({ queryKey: cartKeys.root });
        return;
      }
      // 관리자가 그사이 입금 계좌를 바꿨다 — 계좌 목록을 다시 받는다(고른 계좌가 없어졌으면 pickBankAccount 가 첫 계좌로).
      if (isBankAccountRejected(error)) void qc.invalidateQueries({ queryKey: paymentConfigKeys.root });
      showToast(errorMessage(error, t('checkout.order_failed')), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy };
}

/**
 * 주문 금액 미리보기 — 배송비 쿠폰은 서버 후보(`legacy-sendcost`, 사용한 쿠폰 제외·서버 할인액)가 오면 그것으로, 그 전·실패 시엔
 * 로컬 계산. 서버 후보는 주문 쿠폰 적용 후 금액 기준이라 한 번 계산한 뒤 조회한다.
 */
function useOrderPreview(data: Data, values: OrderFormValues, isMember: boolean): OrderPreview {
  const input = {
    items: data.cart.data?.items ?? [],
    shippingCost: data.cart.data?.send_cost ?? 0,
    myCoupons: data.coupons.data ?? [],
    couponId: values.couponId,
    sendCouponId: values.sendCouponId,
    pointRequested: values.pointUse,
    pointBalance: data.points.data?.balance ?? 0,
    policy: data.policy.data,
  };
  const base = buildOrderPreview(input);
  const enabled = isMember && input.shippingCost > 0 && base.sendCoupons.length > 0;
  const server = useSendCostCouponsQuery(base.orderAmountAfterCoupons, input.shippingCost, enabled);
  return server.data ? buildOrderPreview({ ...input, serverSendCoupons: server.data }) : base;
}

/**
 * 결제 경로는 관리자 쇼핑몰 설정의 PG 가 정한다 — KCP·이니시스·나이스페이는 WebView 결제(T-P2-07), 토스는 Toss 결제창(T-P1D-06).
 * (예전 `webview_pg` 플래그 게이트는 없앴다: 관리자가 고른 PG 로 바로 결제된다.)
 */
function usePgContext(data: Data): PgContext {
  const shopName = useSettingsQuery().data?.cf_title ?? '';
  const config = data.config.data;
  return {
    webview: isWebViewPg(config?.pg_service),
    tossClientKey: tossCheckoutReady(config) ? (config?.client?.client_key ?? null) : null,
    testMode: config?.is_test_mode ?? false,
    shopName,
  };
}

function useCheckoutModel(props: Props, data: Data, isMember: boolean, pg: PgContext) {
  const { state } = useAuth();
  const addresses = data.addresses.data ?? [];
  const params = props.route.params;
  const form = useCheckoutForm({
    email: state.member?.mb_email ?? '',
    defaultAddress: addresses.find((a) => a.ad_default === 1) ?? addresses[0],
    postcode: params?.postcode,
    postcodeField: params?.postcodeField,
  });
  const methods = checkoutMethods(data.config.data, pg.webview);
  const accounts = data.config.data?.bank_accounts ?? [];
  const values: OrderFormValues = {
    ...form.values,
    method: form.values.method || methods[0]?.value || '',
    bankAccount: pickBankAccount(form.values.bankAccount, accounts),
  };
  const preview = useOrderPreview(data, values, isMember);
  const addressProps: Omit<AddressProps, 'field' | 'value'> = {
    onChange: form.patchAddress,
    onFindZip: (field: PostcodeField) => props.navigation.navigate('Postcode', { target: 'Checkout', field }),
  };
  return { values, patch: form.patch, methods, accounts, preview, addressProps, clientUid: form.clientUid };
}

type Model = ReturnType<typeof useCheckoutModel>;

function AddressSection({ model, data, isMember }: { model: Model; data: Data; isMember: boolean }) {
  const { values, patch, addressProps } = model;
  // 시안(Claude Design v2 주문서): 섹션마다 테두리 카드.
  return (
    <>
      <CheckoutCard
        title={t('checkout.items_title')}
        count={t('checkout.items_count', { count: data.cart.data?.total_qty ?? 0 })}
        testID="checkout-items"
      >
        <OrderItems items={data.cart.data?.items ?? []} />
      </CheckoutCard>
      <CheckoutCard title={t('checkout.orderer')}>
        <AddressFields field="orderer" value={values.orderer} {...addressProps} />
        <Field
          label={t('checkout.email')}
          value={values.email}
          onChangeText={(email) => patch({ email })}
          keyboardType="email-address"
          autoCapitalize="none"
          testID="checkout-email"
        />
      </CheckoutCard>
      <CheckoutCard title={t('checkout.recipient')}>
        <RecipientBlock
          values={values}
          patch={patch}
          addresses={data.addresses.data ?? []}
          isMember={isMember}
          onPickSaved={(a) => patch({ recipientChoice: a.ad_id, recipient: addressToOrderAddress(a) })}
          addressProps={addressProps}
        />
        <Field
          label={t('checkout.memo')}
          value={values.memo}
          onChangeText={(memo) => patch({ memo })}
          maxLength={255}
          testID="checkout-memo"
        />
      </CheckoutCard>
    </>
  );
}

function MemberOrGuest({
  isMember,
  values,
  patch,
  preview,
  balance,
}: {
  isMember: boolean;
  values: OrderFormValues;
  patch: Patch;
  preview: OrderPreview;
  balance: number;
}) {
  if (isMember) {
    return (
      <CheckoutCard title={t('checkout.discounts')}>
        <DiscountBlock preview={preview} values={values} patch={patch} pointBalance={balance} />
      </CheckoutCard>
    );
  }
  return (
    <CheckoutCard title={t('checkout.guest_password')}>
      <Field
        label={t('checkout.guest_password')}
        helper={t('checkout.guest_password_hint')}
        value={values.guestPassword}
        onChangeText={(guestPassword) => patch({ guestPassword })}
        secureTextEntry
        maxLength={20}
        testID="checkout-guest-password"
      />
    </CheckoutCard>
  );
}

function CheckoutForm({ props, data, isMember }: { props: Props; data: Data; isMember: boolean }) {
  const pg = usePgContext(data);
  const model = useCheckoutModel(props, data, isMember, pg);
  const { values, patch, preview } = model;
  const shownCtIds = shownOrderCtIds(props.route.params?.ctIds, data.cart.data?.items);
  const { submit, busy } = useSubmitOrder(
    { props, clientUid: model.clientUid, isMember, pg, shownCtIds },
    model.methods,
  );
  const configPending = data.config.isPending;
  const label = values.method === 'bank' ? 'checkout.submit_bank' : 'checkout.submit_pay';
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="checkout-form">
      <AddressSection model={model} data={data} isMember={isMember} />
      <MemberOrGuest
        isMember={isMember}
        values={values}
        patch={patch}
        preview={preview}
        balance={data.points.data?.balance ?? 0}
      />
      <CheckoutCard title={t('checkout.summary_title')}>
        <SummaryBlock preview={preview} />
      </CheckoutCard>
      <CheckoutCard title={t('checkout.payment')}>
        <PaymentBlock
          methods={model.methods}
          bankAccounts={model.accounts}
          values={values}
          patch={patch}
          testMode={data.config.data?.is_test_mode ?? false}
        />
      </CheckoutCard>
      <CheckoutCard title={t('checkout.agree_title')}>
        <AgreementBlock
          values={values}
          patch={patch}
          onView={(kind) => props.navigation.navigate('LegalText', { kind })}
        />
      </CheckoutCard>
      <SubmitButton
        label={t(label, { amount: formatWon(preview.total) })}
        busy={busy || configPending}
        onSubmit={() => void submit({ ...values, pointUse: preview.point.pointUse })}
      />
    </ScrollView>
  );
}

/** 결제 버튼 — 웹 데모는 결제창을 열 수 없어 안내만 띄운다(docs/web-demo.md). */
function SubmitButton({ label, busy, onSubmit }: { label: string; busy: boolean; onSubmit: () => void }) {
  return (
    <Button
      block
      size="comfortable"
      label={label}
      onPress={Platform.OS === 'web' ? () => Alert.alert(t('web.checkout_blocked')) : onSubmit}
      loading={busy}
      disabled={busy}
      testID="checkout-submit"
    />
  );
}

export function CheckoutScreen(props: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const isMember = state.member !== null;
  const params = props.route.params;
  const data = useCheckoutData(params?.ctIds, params?.direct, isMember);
  let body: React.ReactNode;
  if (data.cart.isPending) body = <Skeleton height={200} style={styles.pad} />;
  else if (data.cart.isError && !data.cart.data) {
    body = (
      <ErrorState error={data.cart.error} onRetry={() => void data.cart.refetch()} retrying={data.cart.isRefetching} />
    );
  } else if (!data.cart.data?.items.length) body = <EmptyState title={t('checkout.empty')} testID="checkout-empty" />;
  else body = <CheckoutForm props={props} data={data} isMember={isMember} />;
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('checkout.title')} leftIcon="←" onLeftPress={() => props.navigation.goBack()} />
      <View style={styles.root}>{body}</View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  content: { padding: SPACE[4], gap: SPACE[3], paddingBottom: SPACE[8] },
});
