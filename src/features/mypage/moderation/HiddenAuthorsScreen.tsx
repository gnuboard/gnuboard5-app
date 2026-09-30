/**
 * 숨긴 작성자 (PLAN T-P2-05) — 리뷰·상품문의·쪽지·투표의견에서 "이 작성자 숨기기"로 넣은 로컬 차단 목록을 보고 되돌린다.
 * 이 기기에만 저장된다(게시판 글/댓글 차단은 별도의 서버 기능 — BlockedUsers 화면).
 */
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { blockListKey, unblockAuthor, useLocalBlockList } from '../../../entities/moderation/localBlockList';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { TopAppBar } from '../../../shared/ui/TopAppBar';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Props = NativeStackScreenProps<RootStackParamList, 'HiddenAuthors'>;

export function HiddenAuthorsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const list = useLocalBlockList();
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'));
  const restore = async (key: string) => {
    await unblockAuthor(key);
    await qc.invalidateQueries({ queryKey: blockListKey });
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <TopAppBar title={t('hidden_authors.title')} leftIcon="←" onLeftPress={back} />
      <FlatList
        data={list.data ?? []}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`hidden-author-${item.key}`}>
            <AppText variant="bodySm" style={styles.grow} numberOfLines={1}>
              {item.label}
            </AppText>
            <Button
              label={t('hidden_authors.restore')}
              variant="secondary"
              onPress={() => void restore(item.key)}
              testID={`hidden-author-restore-${item.key}`}
            />
          </View>
        )}
        ListHeaderComponent={
          <AppText variant="caption" tone="onSurfaceCaption" style={styles.pad}>
            {t('hidden_authors.hint')}
          </AppText>
        }
        ListEmptyComponent={
          list.isPending ? null : <EmptyState title={t('hidden_authors.empty')} testID="hidden-authors-empty" />
        }
        testID="hidden-authors"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { margin: SPACE[4] },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[3],
    borderBottomWidth: 1,
  },
});
