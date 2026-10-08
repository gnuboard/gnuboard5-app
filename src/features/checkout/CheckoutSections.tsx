/**
 * 주문서 섹션 (PLAN T-P1D-02) — 표시·입력만. 상태는 useCheckoutForm, 계산은 pricing, 검증·전송은 CheckoutScreen.
 * 주문자/수령인 주소 · 결제 수단(+무통장 계좌·입금자, 테스트 모드 배지) · 할인(회원: 주문·배송비 쿠폰, 포인트) · 약관 · 합계.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Address } from '../../entities/address/api';
import type { MyCoupon } from '../../entities/coupon/schema';
import type { PostcodeField } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { formatWon } from '../../shared/lib/money';
import { AppText } from '../../shared/ui/AppText';
import { Badge } from '../../shared/ui/Badge';
import { Button } from '../../shared/ui/Button';
import { Chip } from '../../shared/ui/Chip';
import { Field } from '../../shared/ui/Field';
import { AgreeRow } from '../../shared/ui/form/FormParts';
import { SPACE } from '../../shared/ui/tokens/primitive';
import { formatHopeDate, hopeDateOptions, type HopeDateConfig } from './hopeDate';
import type { CheckoutMethod } from './methods';
import type { OrderAddress, OrderFormValues } from './orderForm.schema';
import type { OrderPreview } from './pricing';

type Patch = (next: Partial<OrderFormValues>) => void;

/** 안쪽 가로 스크롤도 'handled' — 기본값이면 키보드가 떠 있을 때 첫 탭이 키보드만 닫고 칩 선택은 무시된다. */
function ChipRow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chips}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

interface HopeDateProps {
  config: HopeDateConfig | null | undefined;
  value: string;
  onChange: (value: string) => void;
}

/** 희망배송일 — 관리자가 켰을 때만. 고를 수 있는 날만 칩으로 보여 범위 밖 날은 고를 수 없다(필수). */
export function HopeDateFields({ config, value, onChange }: HopeDateProps) {
  const options = hopeDateOptions(config);
  if (!config?.use) return null;
  return (
    <View style={styles.chips}>
      <AppText variant="label">{t('checkout.hope_date')}</AppText>
      <ChipRow testID="hope-date-row">
        {options.map((ymd, index) => (
          <Chip
            key={ymd}
            label={formatHopeDate(ymd)}
            selected={value === ymd}
            onPress={() => onChange(ymd)}
            testID={`hope-date-${index}`}
          />
        ))}
      </ChipRow>
      <AppText variant="caption" tone="onSurfaceCaption">
        {t('checkout.hope_date_hint')}
      </AppText>
    </View>
  );
}

export interface AddressProps {
  field: PostcodeField;
  value: OrderAddress;
  onChange: (field: PostcodeField, next: Partial<OrderAddress>) => void;
  onFindZip: (field: PostcodeField) => void;
}

function ZipRow({ field, value, onChange, onFindZip }: AddressProps) {
  return (
    <View style={styles.zipRow}>
      <Field
        label={t('checkout.zip')}
        required
        value={value.zip}
        onChangeText={(text) => onChange(field, { zip: text.replace(/\D/g, '') })}
        keyboardType="number-pad"
        maxLength={5}
        containerStyle={styles.grow}
        testID={`${field}-zip`}
      />
      <Button
        label={t('checkout.find_zip')}
        variant="secondary"
        onPress={() => onFindZip(field)}
        testID={`${field}-find-zip`}
      />
    </View>
  );
}

export function AddressFields({ field, value, onChange, onFindZip }: AddressProps) {
  const set = (key: keyof OrderAddress) => (text: string) => onChange(field, { [key]: text });
  return (
    <View style={styles.group}>
      <Field
        label={t('checkout.name')}
        required
        value={value.name}
        onChangeText={set('name')}
        maxLength={50}
        testID={`${field}-name`}
      />
      <Field
        label={t('checkout.hp')}
        required
        value={value.hp}
        onChangeText={set('hp')}
        keyboardType="phone-pad"
        maxLength={30}
        testID={`${field}-hp`}
      />
      <ZipRow field={field} value={value} onChange={onChange} onFindZip={onFindZip} />
      <Field
        label={t('checkout.addr1')}
        required
        value={value.addr1}
        onChangeText={set('addr1')}
        maxLength={255}
        testID={`${field}-addr1`}
      />
      <Field
        label={t('checkout.addr2')}
        value={value.addr2}
        onChangeText={set('addr2')}
        maxLength={255}
        testID={`${field}-addr2`}
      />
    </View>
  );
}

interface RecipientProps {
  values: OrderFormValues;
  patch: Patch;
  addresses: readonly Address[];
  isMember: boolean;
  onPickSaved: (address: Address) => void;
  addressProps: Omit<AddressProps, 'field' | 'value'>;
}

export function RecipientBlock({ values, patch, addresses, isMember, onPickSaved, addressProps }: RecipientProps) {
  const choice = values.recipientChoice;
  return (
    <View style={styles.group}>
      <ChipRow testID="recipient-choices">
        <Chip
          label={t('checkout.same_as_orderer')}
          selected={choice === 'same'}
          onPress={() => patch({ recipientChoice: 'same' })}
          testID="recipient-same"
        />
        <Chip
          label={t('checkout.new_address')}
          selected={choice === 'new'}
          onPress={() => patch({ recipientChoice: 'new' })}
          testID="recipient-new"
        />
        {addresses.map((address) => (
          <Chip
            key={address.ad_id}
            label={address.ad_subject || address.ad_name}
            selected={choice === address.ad_id}
            onPress={() => onPickSaved(address)}
            testID={`recipient-saved-${address.ad_id}`}
          />
        ))}
      </ChipRow>
      {choice === 'same' ? null : <AddressFields field="recipient" value={values.recipient} {...addressProps} />}
      {choice === 'new' && isMember ? (
        <AgreeRow
          testID="recipient-save"
          label={t('checkout.save_address')}
          checked={values.saveAddress}
          onToggle={() => patch({ saveAddress: !values.saveAddress })}
        />
      ) : null}
    </View>
  );
}

interface PaymentProps {
  methods: readonly CheckoutMethod[];
  bankAccounts: readonly string[];
  values: OrderFormValues;
  patch: Patch;
  testMode: boolean;
}

function BankFields({ bankAccounts, values, patch }: Omit<PaymentProps, 'methods' | 'testMode'>) {
  return (
    <>
      <AppText variant="label">{t('checkout.bank_account')}</AppText>
      {bankAccounts.map((account, index) => (
        <Chip
          key={account}
          label={account}
          selected={values.bankAccount === account}
          onPress={() => patch({ bankAccount: account })}
          testID={`bank-account-${index}`}
        />
      ))}
      <Field
        label={t('checkout.depositor')}
        required
        value={values.depositName}
        onChangeText={(text) => patch({ depositName: text })}
        maxLength={20}
        testID="checkout-depositor"
      />
    </>
  );
}

export function PaymentBlock({ methods, bankAccounts, values, patch, testMode }: PaymentProps) {
  return (
    <View style={styles.group}>
      {testMode ? <Badge label={t('checkout.test_mode')} tone="error" testID="checkout-test-mode" /> : null}
      <ChipRow testID="checkout-methods">
        {methods.map((method) => (
          <Chip
            key={method.value}
            label={t(method.labelKey)}
            selected={values.method === method.value}
            onPress={() => patch({ method: method.value })}
            testID={`method-${method.value}`}
          />
        ))}
      </ChipRow>
      {values.method === 'bank' ? <BankFields bankAccounts={bankAccounts} values={values} patch={patch} /> : null}
    </View>
  );
}

interface CouponChoicesProps {
  label: string;
  coupons: readonly MyCoupon[];
  selected: string | null;
  onPick: (id: string | null) => void;
  testID: string;
}

function CouponChoices({ label, coupons, selected, onPick, testID }: CouponChoicesProps) {
  if (!coupons.length) return null;
  return (
    <View style={styles.group}>
      <AppText variant="label">{label}</AppText>
      <ChipRow testID={testID}>
        <Chip label={t('checkout.no_coupon')} selected={selected === null} onPress={() => onPick(null)} />
        {coupons.map((coupon) => (
          <Chip
            key={coupon.cp_id}
            label={coupon.cp_subject}
            selected={selected === coupon.cp_id}
            onPress={() => onPick(coupon.cp_id)}
            testID={`${testID}-${coupon.cp_id}`}
          />
        ))}
      </ChipRow>
    </View>
  );
}

interface DiscountProps {
  preview: OrderPreview;
  values: OrderFormValues;
  patch: Patch;
  pointBalance: number;
}

export function DiscountBlock({ preview, values, patch, pointBalance }: DiscountProps) {
  const { point } = preview;
  const pointError = point.warning
    ? t(`checkout.point_${point.warning}`, { amount: formatWon(point.maxPointUse) })
    : undefined;
  return (
    <View style={styles.group}>
      <CouponChoices
        label={t('checkout.coupon')}
        coupons={preview.orderCoupons}
        selected={values.couponId}
        onPick={(id) => patch({ couponId: id })}
        testID="order-coupons"
      />
      <CouponChoices
        label={t('checkout.send_coupon')}
        coupons={preview.sendCoupons}
        selected={values.sendCouponId}
        onPick={(id) => patch({ sendCouponId: id })}
        testID="send-coupons"
      />
      {point.maxPointUse > 0 ? (
        <Field
          label={t('checkout.points')}
          helper={t('checkout.points_have', { amount: formatWon(pointBalance), max: formatWon(point.maxPointUse) })}
          value={values.pointUse ? String(values.pointUse) : ''}
          onChangeText={(text) => patch({ pointUse: Number(text.replace(/\D/g, '')) || 0 })}
          error={pointError}
          keyboardType="number-pad"
          testID="checkout-points"
        />
      ) : null}
    </View>
  );
}

interface AgreementProps {
  values: OrderFormValues;
  patch: Patch;
  onView: (kind: 'terms' | 'privacy') => void;
}

export function AgreementBlock({ values, patch, onView }: AgreementProps) {
  return (
    <View style={styles.group}>
      <AgreeRow
        testID="agree-terms"
        label={t('checkout.agree_terms')}
        checked={values.agreeTerms}
        onToggle={() => patch({ agreeTerms: !values.agreeTerms })}
        onView={() => onView('terms')}
      />
      <AgreeRow
        testID="agree-privacy"
        label={t('checkout.agree_privacy')}
        checked={values.agreePrivacy}
        onToggle={() => patch({ agreePrivacy: !values.agreePrivacy })}
        onView={() => onView('privacy')}
      />
    </View>
  );
}

function SummaryRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySm" tone="onSurfaceSecondary">
        {label}
      </AppText>
      <AppText variant="bodySm" testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

export function SummaryBlock({ preview }: { preview: OrderPreview }) {
  const discount = preview.cartCoupon + preview.couponDiscount + preview.sendCouponDiscount;
  return (
    <View style={styles.group} testID="checkout-summary">
      <SummaryRow label={t('checkout.subtotal')} value={formatWon(preview.subtotal)} />
      <SummaryRow label={t('checkout.shipping')} value={formatWon(preview.shippingCost)} />
      {discount > 0 ? (
        <SummaryRow label={t('checkout.discount')} value={`-${formatWon(discount)}`} testID="summary-discount" />
      ) : null}
      {preview.point.pointUse > 0 ? (
        <SummaryRow label={t('checkout.points_used')} value={`-${formatWon(preview.point.pointUse)}`} />
      ) : null}
      <View style={styles.row}>
        <AppText variant="label">{t('checkout.total')}</AppText>
        <AppText variant="cardTitle" testID="summary-total">
          {formatWon(preview.total)}
        </AppText>
      </View>
      <AppText variant="caption" tone="onSurfaceCaption">
        {t('checkout.preview_note')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE[3] },
  chips: { gap: SPACE[2] },
  zipRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE[2] },
  grow: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
