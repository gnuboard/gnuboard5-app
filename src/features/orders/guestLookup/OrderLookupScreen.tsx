/**
 * 비회원 주문조회 (PLAN T-P1D-11, PRD SH-18) — 주문번호 + 주문 비밀번호 → `POST /shop/orders/lookup` → uid 재발급 →
 * 기기 보안 저장소(guestOrderUids)에 저장 → 주문 상세로 교체. 틀리면 서버가 404(주문 없음과 구분하지 않는다).
 * 비밀번호는 요청 본문으로만 보내고 화면 상태 밖에 남기지 않는다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { lookupGuestOrder } from '../../../entities/order/api';
import type { RootStackParamList } from '../../../navigation/types';
import { ApiError } from '../../../shared/api/client';
import { t } from '../../../shared/i18n';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Field } from '../../../shared/ui/Field';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { saveGuestOrder } from '../guestOrderUids';
import { KeyboardScreen } from '../../../shared/ui/KeyboardScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderLookup'>;

const ORDER_ID = /^[0-9]{10,20}$/;

export function lookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return t('order.lookup_not_found');
  return errorMessage(error, t('order.lookup_failed'));
}

function useLookup(navigation: Props['navigation']) {
  const [busy, setBusy] = useState(false);
  const submit = async (odId: string, password: string) => {
    if (!ORDER_ID.test(odId)) return showToast(t('order.lookup_err_id'), 'error');
    if (!password) return showToast(t('order.lookup_err_password'), 'error');
    setBusy(true);
    try {
      const found = await lookupGuestOrder(odId, password);
      await saveGuestOrder(found.odId, found.uid);
      navigation.replace('OrderDetail', { odId: found.odId, uid: found.uid });
    } catch (error) {
      showToast(lookupErrorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return { submit, busy };
}

export function OrderLookupScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const [odId, setOdId] = useState(route.params?.odId ?? '');
  const [password, setPassword] = useState('');
  const { submit, busy } = useLookup(navigation);
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  return (
    <KeyboardScreen style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('order.guest_lookup')} leftIcon="←" onLeftPress={back} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="bodySm" tone="onSurfaceSecondary">
          {t('order.lookup_hint')}
        </AppText>
        <Field
          label={t('order.lookup_id')}
          value={odId}
          onChangeText={(text) => setOdId(text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={20}
          testID="lookup-od-id"
        />
        <Field
          label={t('order.lookup_password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          maxLength={20}
          testID="lookup-password"
        />
        <Button
          label={t('order.lookup_submit')}
          onPress={() => void submit(odId, password)}
          loading={busy}
          disabled={busy}
          testID="lookup-submit"
        />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: SPACE[4], gap: SPACE[3] },
});
