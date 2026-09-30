/**
 * 배송지 추가·수정 (PLAN T-P1C-10, PRD SH-23) — 수정이면 목록 캐시에서 값을 채운다. 우편번호는 Daum 검색(Postcode
 * 화면)이 `params.postcode` 로 돌려주면 우편번호·주소·참고항목을 채운다(직접 입력도 가능).
 * 저장 전 로컬 검증, 서버 422 는 필드 옆에 표시, 성공하면 목록으로.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, type KeyboardTypeOptions } from 'react-native';
import { useAddressesQuery, useSaveAddress, type Address } from '../../../entities/address/api';
import type { PostcodeResult, RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Field } from '../../../shared/ui/Field';
import { AgreeRow } from '../../../shared/ui/form/FormParts';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import {
  ADDRESS_LIMITS,
  addressErrorsFromApi,
  applyPostcode,
  EMPTY_ADDRESS_FORM,
  formFromAddress,
  toAddressInput,
  validateAddressForm,
  type AddressErrors,
  type AddressField,
  type AddressFormValues,
} from './addressForm';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;
type Patch = Partial<AddressFormValues>;

interface FieldSpec {
  key: AddressField;
  label: string;
  limit: number;
  required?: boolean;
  keyboard?: KeyboardTypeOptions;
  placeholder?: string;
}

const { subject, name, phone, address } = ADDRESS_LIMITS;
const FIELDS_BEFORE_ZIP: FieldSpec[] = [
  { key: 'subject', label: 'address.subject', limit: subject, placeholder: 'address.subject_ph' },
  { key: 'name', label: 'address.name', limit: name, required: true },
  { key: 'hp', label: 'address.hp', limit: phone, required: true, keyboard: 'phone-pad' },
  { key: 'tel', label: 'address.tel', limit: phone, keyboard: 'phone-pad' },
];
const FIELDS_AFTER_ZIP: FieldSpec[] = [
  { key: 'addr1', label: 'address.addr1', limit: address, required: true },
  { key: 'addr2', label: 'address.addr2', limit: address },
  { key: 'addr3', label: 'address.addr3', limit: address },
];

/** 초기값(수정은 캐시에서) + 우편번호 결과가 새로 오면 한 번 반영(렌더 중 파생 상태 — useEffect 없이). */
function useFormValues(existing: Address | undefined, postcode: PostcodeResult | undefined) {
  const [values, setValues] = useState<AddressFormValues>(() =>
    existing ? formFromAddress(existing) : EMPTY_ADDRESS_FORM,
  );
  const [seeded, setSeeded] = useState(existing !== undefined);
  const [appliedPostcode, setAppliedPostcode] = useState<PostcodeResult | undefined>(undefined);
  if (!seeded && existing) {
    setSeeded(true);
    setValues(formFromAddress(existing));
  }
  if (postcode && postcode !== appliedPostcode) {
    setAppliedPostcode(postcode);
    setValues((current) => applyPostcode(current, postcode));
  }
  return [values, setValues] as const;
}

function SpecField({
  spec,
  values,
  errors,
  onChange,
}: {
  spec: FieldSpec;
  values: AddressFormValues;
  errors: AddressErrors;
  onChange: (p: Patch) => void;
}) {
  return (
    <Field
      label={t(spec.label)}
      placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
      required={spec.required}
      value={values[spec.key]}
      error={errors[spec.key]}
      maxLength={spec.limit}
      keyboardType={spec.keyboard}
      onChangeText={(value) => onChange({ [spec.key]: value })}
      testID={`address-${spec.key}`}
    />
  );
}

interface FieldsProps {
  values: AddressFormValues;
  errors: AddressErrors;
  onChange: (patch: Patch) => void;
  onFindZip: () => void;
}

function AddressFields({ values, errors, onChange, onFindZip }: FieldsProps) {
  const field = (spec: FieldSpec) => (
    <SpecField key={spec.key} spec={spec} values={values} errors={errors} onChange={onChange} />
  );
  return (
    <>
      {FIELDS_BEFORE_ZIP.map(field)}
      <View style={styles.zipRow}>
        <Field
          label={t('address.zip')}
          required
          value={values.zip}
          error={errors.zip}
          maxLength={5}
          keyboardType="number-pad"
          onChangeText={(value) => onChange({ zip: value.replace(/\D/g, '') })}
          containerStyle={styles.grow}
          testID="address-zip"
        />
        <Button label={t('address.find_zip')} variant="secondary" onPress={onFindZip} testID="address-find-zip" />
      </View>
      {FIELDS_AFTER_ZIP.map(field)}
      <AgreeRow
        testID="address-default"
        label={t('address.default')}
        checked={values.isDefault}
        onToggle={() => onChange({ isDefault: !values.isDefault })}
      />
    </>
  );
}

function useSubmitAddress(adId: number | null, onDone: () => void) {
  const save = useSaveAddress();
  const [errors, setErrors] = useState<AddressErrors>({});
  const submit = (values: AddressFormValues) => {
    const local = validateAddressForm(values);
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate(
      { adId, input: toAddressInput(values) },
      {
        onSuccess: () => {
          showToast(t('address.saved'), 'success');
          onDone();
        },
        onError: (error) => {
          const fromServer = addressErrorsFromApi(error);
          if (Object.keys(fromServer).length) setErrors(fromServer);
          else showToast(errorMessage(error, t('address.save_failed')), 'error');
        },
      },
    );
  };
  return { submit, errors, saving: save.isPending };
}

export function AddressFormScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const adId = route.params?.adId ?? null;
  const list = useAddressesQuery(adId !== null);
  const existing = adId === null ? undefined : list.data?.find((row) => row.ad_id === adId);
  const [values, setValues] = useFormValues(existing, route.params?.postcode);
  const { submit, errors, saving } = useSubmitAddress(adId, () => navigation.goBack());
  const onChange = (patch: Patch) => setValues((current) => ({ ...current, ...patch }));
  let body: React.ReactNode;
  if (adId !== null && list.isPending) body = <Skeleton height={240} style={styles.pad} />;
  else if (adId !== null && !existing) body = <EmptyState title={t('address.not_found')} testID="address-not-found" />;
  else {
    body = (
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <AddressFields
          values={values}
          errors={errors}
          onChange={onChange}
          onFindZip={() => navigation.navigate('Postcode', { target: 'AddressForm' })}
        />
        <Button
          label={t('address.save')}
          onPress={() => submit(values)}
          loading={saving}
          disabled={saving}
          testID="address-save"
        />
      </ScrollView>
    );
  }
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={adId === null ? t('address.new_title') : t('address.edit_title')}
        leftIcon="←"
        onLeftPress={() => navigation.goBack()}
      />
      {body}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  form: { padding: SPACE[4], gap: SPACE[3], paddingBottom: SPACE[8] },
  zipRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE[2] },
  grow: { flex: 1 },
});
