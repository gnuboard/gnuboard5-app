/**
 * 알림 카드 — NotificationsScreen 의 FlatList renderItem.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NotificationItem } from '../../../entities/notification/api';
import { RADIUS, SHADOW, useColors, type Palette } from '../../../shared/ui/tokens/theme';
import { t } from '../../../shared/i18n';

interface Props {
  item: NotificationItem;
  onPress: () => void;
  onLongPress: () => void;
  disabled?: boolean;
}

export function NotificationCard({ item, onPress, onLongPress, disabled = false }: Props) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[
        s.card,
        { backgroundColor: colors.surfaceContainerLowest },
        !item.is_read && { backgroundColor: colors.primaryFixed },
        disabled && { opacity: 0.55 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${item.is_read ? t('notification.a11y_read') : t('notification.a11y_unread')}: ${item.nt_title}. ${item.nt_body}. ${formatDate(item.nt_sent_at)}`}
      accessibilityHint={item.dday_id ? t('notification.a11y_hint_open') : t('notification.a11y_hint_delete')}
    >
      <View style={s.headerRow}>
        <View style={[s.typeDot, dotColor(item.nt_type, colors)]} />
        <Text style={[s.title, { color: colors.onSurface }]} numberOfLines={1}>
          {item.nt_title || t('notification.untitled')}
        </Text>
        {!item.is_read && <View style={[s.unreadDot, { backgroundColor: colors.error }]} />}
      </View>
      {item.nt_body ? (
        <Text style={[s.body, { color: colors.onSurfaceVariant }]} numberOfLines={2}>
          {item.nt_body}
        </Text>
      ) : null}
      <Text style={[s.date, { color: colors.outline }]}>{formatDate(item.nt_sent_at)}</Text>
    </TouchableOpacity>
  );
}

function dotColor(type: NotificationItem['nt_type'], colors: Palette) {
  switch (type) {
    case 'dday':
      return { backgroundColor: colors.primary };
    case 'system':
      return { backgroundColor: colors.tertiary };
    case 'custom':
      return { backgroundColor: colors.secondary };
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${t('time.today')} ${hh}:${mi}`;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (d.getFullYear() === now.getFullYear()) return `${m}.${dd} ${hh}:${mi}`;
  return `${d.getFullYear()}.${m}.${dd} ${hh}:${mi}`;
}

const s = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: 4,
    ...SHADOW.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: 15, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, lineHeight: 19 },
  date: { fontSize: 11, fontWeight: '500', marginTop: 4 },
});
