/** 내 댓글 목록 (PLAN T-P1B-07, PRD CM-15): `wr_parent` 가 글 — 탭하면 그 글 상세로. 본문은 태그를 벗긴 미리보기. */
import type { ListRenderItemInfo } from '@shopify/flash-list';
import React, { useCallback } from 'react';
import { useMyCommentsInfiniteQuery } from '../../../entities/member/queries';
import type { MyCommentDto } from '../../../entities/member/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import { htmlToPlainText } from '../../../shared/html/plainText';
import { t } from '../../../shared/i18n';
import { formatServerDate } from '../../../shared/lib/serverTime';
import { ContentRow, MyContentList, useRootNavigation } from './MyContentList';

export function MyCommentsScreen() {
  const navigation = useRootNavigation();
  const isMember = useAuth().state.member !== null;
  const query = useMyCommentsInfiniteQuery(isMember);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MyCommentDto>) => (
      <ContentRow
        title={htmlToPlainText(item.wr_content) || t('my.comment_empty_body')}
        subtitle={item.bo_subject ?? item.bo_table}
        meta={formatServerDate(item.wr_datetime)}
        onPress={() => navigation.navigate('PostDetail', { board: item.bo_table, wr_id: item.wr_parent })}
        testID={`my-comment-${item.bo_table}-${item.wr_id}`}
      />
    ),
    [navigation],
  );
  return (
    <MyContentList
      title={t('my.comments')}
      emptyTitle={t('my.comments_empty')}
      query={query}
      keyExtractor={(item) => `${item.bo_table}:${item.wr_id}`}
      renderItem={renderItem}
      testID="my-comments-screen"
    />
  );
}
