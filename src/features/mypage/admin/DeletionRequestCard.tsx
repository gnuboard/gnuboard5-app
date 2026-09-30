/**
 * 계정 삭제 요청 카드 (PLAN T-P1A-14) — 앱 밖(웹 폼)으로 들어온 삭제 요청. 연락 이메일은 형식이 맞을 때만 mailto 링크.
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import type { AccountDeletionRequestItem } from '../../../entities/accountDeletion/api';
import { t } from '../../../shared/i18n';
import { useColors } from '../../../shared/ui/tokens/theme';
import { adminCardStyles as s } from './AdminListParts';
import { formatAdminDate } from './useAdminList';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function mailtoUrlForEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed)) return null;
  return `mailto:${encodeURIComponent(trimmed)}`;
}

function ContactEmail({ email }: { email: string | undefined }) {
  const colors = useColors();
  const mailto = mailtoUrlForEmail(email);
  if (!email) return null;
  if (!mailto) {
    return (
      <Text style={[s.meta, { color: colors.outline }]} numberOfLines={1}>
        {email}
      </Text>
    );
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      testID="deletion-email"
      onPress={() => {
        void Linking.openURL(mailto).catch(() => Alert.alert(t('common.error'), t('common.open_link_failed')));
      }}
    >
      <Text style={[s.link, { color: colors.primary }]} numberOfLines={1}>
        {email}
      </Text>
    </TouchableOpacity>
  );
}

function StatusButton({ item, busy, onPress }: { item: AccountDeletionRequestItem; busy: boolean; onPress(): void }) {
  const colors = useColors();
  if (item.status === 'open') {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        testID={`deletion-close-${item.request_id}`}
        style={[s.primaryBtn, { backgroundColor: colors.primary }, busy && s.busy]}
        onPress={onPress}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={[s.primaryText, { color: colors.onPrimary }]}>{t('deletion_admin.close')}</Text>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      testID={`deletion-reopen-${item.request_id}`}
      style={[s.ghostBtn, { backgroundColor: colors.surfaceContainer }, busy && s.busy]}
      onPress={onPress}
      disabled={busy}
    >
      <Text style={[s.ghostText, { color: colors.onSurface }]}>{t('deletion_admin.reopen')}</Text>
    </TouchableOpacity>
  );
}

export function DeletionRequestCard({
  item,
  busy,
  onToggle,
}: {
  item: AccountDeletionRequestItem;
  busy: boolean;
  onToggle(): void;
}) {
  const colors = useColors();
  return (
    <View
      testID={`deletion-${item.request_id}`}
      style={[s.card, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceContainer }]}
    >
      <View style={s.cardHead}>
        <Text style={[s.kind, { color: colors.primary }]}>{t(`deletion_admin.status_${item.status}`)}</Text>
        <Text style={[s.date, { color: colors.outline }]}>{formatAdminDate(item.created_at)}</Text>
      </View>
      <Text style={[s.target, { color: colors.onSurface }]} numberOfLines={1}>
        {item.identifier}
      </Text>
      <ContactEmail email={item.contact_email?.trim() || undefined} />
      {item.detail ? <Text style={[s.detail, { color: colors.onSurfaceVariant }]}>{item.detail}</Text> : null}
      <Text style={[s.meta, { color: colors.outline }]}>
        {t('deletion_admin.source')}: {item.request_ip || '-'}
      </Text>
      {item.closed_by ? (
        <Text style={[s.meta, { color: colors.outline }]}>
          {t('deletion_admin.closed_by')}: {item.closed_by}
        </Text>
      ) : null}
      <View style={s.actions}>
        <StatusButton item={item} busy={busy} onPress={onToggle} />
      </View>
    </View>
  );
}
