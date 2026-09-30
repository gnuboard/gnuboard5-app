/** 스크랩 목록 (PLAN T-P1B-07, PRD CM-15/CM-F07): 탭 → 글 상세, ✕ → `DELETE /scraps/{ms_id}`(확인 후). */
import type { ListRenderItemInfo } from '@shopify/flash-list';
import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRemoveScrapMutation, useScrapsInfiniteQuery } from '../../../entities/scrap/queries';
import type { ScrapDto } from '../../../entities/scrap/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { showToast } from '../../../shared/ui/Toast';
import { ContentRow, MyContentList, useRootNavigation } from './MyContentList';

export function ScrapsScreen() {
  const navigation = useRootNavigation();
  const isMember = useAuth().state.member !== null;
  const query = useScrapsInfiniteQuery(isMember);
  const remove = useRemoveScrapMutation();
  const confirmRemove = useCallback(
    (scrap: ScrapDto) => {
      Alert.alert(t('my.scrap_remove_title'), t('my.scrap_remove_message', { title: scrap.wr_subject }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            remove.mutateAsync(scrap).catch(() => showToast(t('board.delete_failed'), 'error'));
          },
        },
      ]);
    },
    [remove],
  );
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ScrapDto>) => (
      <ContentRow
        title={item.wr_subject || t('my.post_missing')}
        subtitle={item.bo_subject}
        meta={formatServerDate(item.ms_datetime)}
        onPress={() => navigation.navigate('PostDetail', { board: item.bo_table, wr_id: item.wr_id })}
        onRemove={() => confirmRemove(item)}
        testID={`scrap-${item.ms_id}`}
      />
    ),
    [navigation, confirmRemove],
  );
  return (
    <MyContentList
      title={t('my.scraps')}
      emptyTitle={t('my.scraps_empty')}
      query={query}
      keyExtractor={(item) => String(item.ms_id)}
      renderItem={renderItem}
      testID="scraps-screen"
    />
  );
}
