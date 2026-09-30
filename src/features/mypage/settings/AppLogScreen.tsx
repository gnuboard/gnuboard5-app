/**
 * 앱 로그 보기 화면 — 디버그용.
 * 설정 → 환경 → "앱 로그" 진입.
 */
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { appLog, type LogEntry, type LogLevel } from '../../../shared/lib/debug/appLog';
import { SHOW_DIAGNOSTICS } from '../../../shared/lib/debug/diagnostics';
import { RADIUS, SPACING, TYPO, useColors, type Palette } from '../../../shared/ui/tokens/theme';
import { t } from '../../../shared/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'AppLog'>;

function levelColor(level: LogLevel, colors: Palette): string {
  switch (level) {
    case 'info':
      return colors.outline;
    case 'warn':
      return '#b07b00';
    case 'error':
      return colors.error;
  }
}

export function AppLogScreen({ navigation }: Props) {
  const colors = useColors();
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (!SHOW_DIAGNOSTICS) return undefined;
    return appLog.subscribe(setEntries);
  }, []);

  const goBackOrSettings = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', tabParams('MyTab'));
    }
  };

  if (!SHOW_DIAGNOSTICS) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <TopAppBar title={t('debug.log_title')} leftIcon="←" onLeftPress={goBackOrSettings} />
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: colors.onSurface }]}>{t('reports_admin.forbidden')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <TopAppBar
        title={t('debug.log_title')}
        leftIcon="←"
        onLeftPress={goBackOrSettings}
        rightIcon={entries.length > 0 ? '🗑' : undefined}
        onRightPress={entries.length > 0 ? () => appLog.clear() : undefined}
      />
      {entries.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyEmoji}>📋</Text>
          <Text style={[s.emptyTitle, { color: colors.onSurface }]}>{t('debug.log_empty')}</Text>
          <Text style={[s.emptySub, { color: colors.onSurfaceVariant }]}>{t('debug.log_empty_sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e, i) => `${e.ts}-${i}`}
          contentContainerStyle={s.listPad}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => (
            <View
              style={[s.item, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.surfaceContainer }]}
            >
              <View style={s.itemHead}>
                <Text style={[s.level, { color: levelColor(item.level, colors) }]}>{item.level.toUpperCase()}</Text>
                <Text style={[s.tag, { color: colors.primary }]}>{item.tag}</Text>
                <Text style={[s.ts, { color: colors.outline }]}>{formatTime(item.ts)}</Text>
              </View>
              <Text style={[s.msg, { color: colors.onSurface }]}>{item.message}</Text>
              {item.extra !== undefined && (
                <Text style={[s.extra, { color: colors.outline }]}>{safeStringify(item.extra)}</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function safeStringify(v: unknown): string {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { ...TYPO.headlineMd },
  emptySub: { ...TYPO.bodySm, textAlign: 'center' },
  listPad: { padding: SPACING.containerMargin, paddingBottom: 60 },
  item: {
    borderRadius: RADIUS.md,
    padding: 10,
    gap: 3,
    borderWidth: 1,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  level: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tag: { fontSize: 11, fontWeight: '700' },
  ts: { fontSize: 10, marginLeft: 'auto' },
  msg: { fontSize: 12, lineHeight: 17 },
  extra: { fontSize: 10, fontFamily: 'monospace', lineHeight: 14 },
});
