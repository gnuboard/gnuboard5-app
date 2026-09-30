/**
 * 배송지 관리 (PLAN T-P1C-10, PRD SH-23) — 회원 전용. 기본 배송지 먼저(서버 정렬). 카드마다 수정·기본으로·삭제(확인 후).
 * 게스트는 로그인 안내(돌아오기). 주문할 때 입력한 주소도 서버가 자동 저장한다.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useAddressesQuery, useDeleteAddress, useSetDefaultAddress, type Address } from '../../../entities/address/api';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { joinZip } from '../../../shared/lib/addressValidation';
import { errorMessage } from '../../../shared/lib/errors';
import { AppText } from '../../../shared/ui/AppText';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { showToast } from '../../../shared/ui/Toast';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'Addresses'>;

export function addressLines(address: Address): string[] {
  const zip = joinZip(address.ad_zip1, address.ad_zip2);
  const main = [address.ad_addr1, address.ad_addr3].filter(Boolean).join(' ');
  return [zip ? `(${zip}) ${main}` : main, address.ad_addr2].filter(Boolean);
}

interface CardProps {
  address: Address;
  onEdit: () => void;
  onDefault: () => void;
  onDelete: () => void;
}

function AddressCard({ address, onEdit, onDefault, onDelete }: CardProps) {
  const { colors } = useTheme();
  const isDefault = address.ad_default === 1;
  return (
    <View style={[styles.card, { borderColor: colors.outlineSubtle }]} testID={`address-${address.ad_id}`}>
      <View style={styles.head}>
        <AppText variant="body" weight="600" numberOfLines={1} style={styles.grow}>
          {address.ad_subject || address.ad_name}
        </AppText>
        {isDefault ? <Badge label={t('address.default_badge')} tone="primary" /> : null}
      </View>
      <AppText variant="bodySm">{`${address.ad_name} · ${address.ad_hp}`}</AppText>
      {addressLines(address).map((line) => (
        <AppText key={line} variant="bodySm" tone="onSurfaceSecondary">
          {line}
        </AppText>
      ))}
      <View style={styles.actions}>
        <Button
          label={t('address.edit')}
          size="compact"
          variant="secondary"
          onPress={onEdit}
          testID={`address-edit-${address.ad_id}`}
        />
        {isDefault ? null : (
          <Button
            label={t('address.set_default')}
            size="compact"
            variant="ghost"
            onPress={onDefault}
            testID={`address-default-${address.ad_id}`}
          />
        )}
        <Button
          label={t('address.delete')}
          size="compact"
          variant="ghost"
          onPress={onDelete}
          accessibilityLabel={t('address.delete_a11y', { name: address.ad_subject || address.ad_name })}
          testID={`address-delete-${address.ad_id}`}
        />
      </View>
    </View>
  );
}

function useAddressActions() {
  const setDefault = useSetDefaultAddress();
  const remove = useDeleteAddress();
  const makeDefault = (adId: number) =>
    setDefault.mutate(adId, { onError: (e) => showToast(errorMessage(e, t('address.default_failed')), 'error') });
  const confirmDelete = (adId: number) =>
    Alert.alert(t('address.delete_confirm_title'), t('address.delete_confirm_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('address.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(adId, { onError: (e) => showToast(errorMessage(e, t('address.delete_failed')), 'error') }),
      },
    ]);
  return { makeDefault, confirmDelete };
}

function AddressList({ onEdit, onAdd }: { onEdit: (adId: number) => void; onAdd: () => void }) {
  const list = useAddressesQuery();
  const { makeDefault, confirmDelete } = useAddressActions();
  if (list.isPending) return <Skeleton height={140} style={styles.pad} />;
  if (list.isError && !list.data) {
    return <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isRefetching} />;
  }
  return (
    <FlatList
      data={list.data ?? []}
      keyExtractor={(row) => String(row.ad_id)}
      renderItem={({ item }) => (
        <AddressCard
          address={item}
          onEdit={() => onEdit(item.ad_id)}
          onDefault={() => makeDefault(item.ad_id)}
          onDelete={() => confirmDelete(item.ad_id)}
        />
      )}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      ListEmptyComponent={
        <EmptyState
          title={t('address.empty')}
          subtitle={t('address.empty_sub')}
          action={{ label: t('address.add'), onPress: onAdd }}
          testID="addresses-empty"
        />
      }
      testID="addresses-list"
    />
  );
}

export function AddressesScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { state } = useAuth();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const add = () => navigation.navigate('AddressForm', undefined);
  let body: React.ReactNode = null;
  if (!state.loading && !state.member) {
    body = (
      <EmptyState
        title={t('address.member_only')}
        action={{
          label: t('auth.login'),
          onPress: () => navigation.navigate('Login', { returnTo: { name: 'Addresses', params: undefined } }),
        }}
        testID="addresses-login"
      />
    );
  } else if (state.member) {
    body = <AddressList onEdit={(adId) => navigation.navigate('AddressForm', { adId })} onAdd={add} />;
  }
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={t('address.title')}
        leftIcon="←"
        onLeftPress={back}
        rightIcon={state.member ? '＋' : undefined}
        onRightPress={state.member ? add : undefined}
        rightA11yLabel={t('address.add')}
      />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  list: { padding: SPACE[4], gap: SPACE[3] },
  card: { borderWidth: 1, borderRadius: RADII.md, padding: SPACE[4], gap: SPACE[1] },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE[2] },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', gap: SPACE[2], marginTop: SPACE[2] },
});
