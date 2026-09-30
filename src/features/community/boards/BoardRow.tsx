/** 게시판 한 줄 (T-P1B-02). 편집 모드에서는 숨김 토글, 아니면 진입. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { boardTitle } from '../../../entities/board/model';
import type { BoardDto } from '../../../entities/board/schema';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface BoardRowProps {
  board: BoardDto;
  editing: boolean;
  hidden: boolean;
  onPress: () => void;
}

export function BoardRow({ board, editing, hidden, onPress }: BoardRowProps) {
  const { colors } = useTheme();
  const title = boardTitle(board);
  const counts = t('boards.counts', { posts: board.bo_count_write ?? 0, comments: board.bo_count_comment ?? 0 });
  const trailing = editing ? (hidden ? t('boards.show') : t('boards.hide')) : '›';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={editing ? `${title} · ${trailing}` : title}
      accessibilityState={editing ? { checked: !hidden } : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceContainer : colors.surface, borderColor: colors.outlineSubtle },
        hidden && editing ? styles.dimmed : null,
      ]}
      testID={`board-row-${board.bo_table}`}
    >
      <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
        <AppText variant="label" tone="primaryStrong">
          {initialOf(title)}
        </AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="cardTitle" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" tone="onSurfaceCaption">
          {counts}
        </AppText>
      </View>
      <AppText variant={editing ? 'labelSm' : 'title'} tone={editing ? 'link' : 'onSurfaceCaption'}>
        {trailing}
      </AppText>
    </Pressable>
  );
}

function initialOf(title: string): string {
  return [...title.trim()][0] ?? '#';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    padding: SPACE[4],
    borderRadius: RADII.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dimmed: { opacity: 0.5 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: SPACE[1] },
});
