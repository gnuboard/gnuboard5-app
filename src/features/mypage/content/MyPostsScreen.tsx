/** 내 글 목록 (PLAN T-P1B-07, PRD CM-15/CM-F16): 탭 → 글 상세. */
import type { ListRenderItemInfo } from '@shopify/flash-list';
import React, { useCallback } from 'react';
import { useMyPostsInfiniteQuery } from '../../../entities/member/queries';
import type { MyPostDto } from '../../../entities/member/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { ContentRow, MyContentList, useRootNavigation } from './MyContentList';

export function MyPostsScreen() {
  const navigation = useRootNavigation();
  const isMember = useAuth().state.member !== null;
  const query = useMyPostsInfiniteQuery(isMember);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MyPostDto>) => (
      <ContentRow
        title={item.wr_subject}
        subtitle={item.bo_subject ?? item.bo_table}
        meta={formatServerDate(item.wr_datetime)}
        onPress={() => navigation.navigate('PostDetail', { board: item.bo_table, wr_id: item.wr_id })}
        testID={`my-post-${item.bo_table}-${item.wr_id}`}
      />
    ),
    [navigation],
  );
  return (
    <MyContentList
      title={t('my.posts')}
      emptyTitle={t('my.posts_empty')}
      query={query}
      keyExtractor={(item) => `${item.bo_table}:${item.wr_id}`}
      renderItem={renderItem}
      testID="my-posts-screen"
    />
  );
}
