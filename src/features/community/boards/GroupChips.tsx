/**
 * 그룹 필터 칩 (T-P1B-02, `GET /recent/groups`). 첫 칩 '전체' = 필터 없음. 가로 스크롤이 세로 공간을 차지하지 않게
 * flexGrow 0 — 세로 flex 부모(최신글 화면) 안에서 목록을 아래로 밀어내던 문제를 막는다.
 */
import React from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { BoardGroupDto } from '../../../entities/board/schema';
import { t } from '../../../shared/i18n';
import { Chip } from '../../../shared/ui/Chip';
import { SPACE } from '../../../shared/ui/tokens/primitive';

export interface GroupChipsProps {
  groups: readonly BoardGroupDto[];
  selected: string | undefined;
  onSelect: (group: string | undefined) => void;
  /** 칩 줄 안쪽 여백 — 부모가 좌우 여백을 주지 않는 화면(최신글)에서 넘긴다. */
  contentStyle?: StyleProp<ViewStyle>;
}

export function GroupChips({ groups, selected, onSelect, contentStyle }: GroupChipsProps) {
  if (groups.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.bar}
      contentContainerStyle={[styles.row, contentStyle]}
      testID="board-group-chips"
    >
      <Chip label={t('boards.group_all')} selected={selected === undefined} onPress={() => onSelect(undefined)} />
      {groups.map((group) => (
        <Chip
          key={group.gr_id}
          label={group.gr_subject}
          selected={selected === group.gr_id}
          onPress={() => onSelect(selected === group.gr_id ? undefined : group.gr_id)}
          testID={`board-group-${group.gr_id}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ bar: { flexGrow: 0 }, row: { gap: SPACE[2] } });
