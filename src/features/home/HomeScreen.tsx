/**
 * 커뮤니티 홈 (design/mockups/adaptive-navigation 01, PRD HM-01) — 제목줄 "☰ · 앱 이름 커뮤니티 · 글쓰기"가 본문과 함께
 * 스크롤하고, 공지사항 → 최신글. ☰ 은 게시판 서랍(사이트 메뉴도 그 안에), 글쓰기는 게시판을 먼저 고른다.
 * 색·글꼴·카드 모양은 Claude Design 토큰을 따른다. 공용 팝업은 여기서 띄운다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { RecentItemDto } from '../../entities/recent/schema';
import { useAppName } from '../../entities/settings/appName';
import { useServiceMenu } from '../../navigation/serviceMenuContext';
import { tabParams, type RootStackParamList } from '../../navigation/types';
import { t } from '../../shared/i18n';
import { ServiceHeader } from '../../shared/ui/ServiceHeader';
import { useTheme } from '../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../shared/ui/tokens/primitive';
import { useMenuLink } from './menus/useMenuLink';
import { PopupHost } from './popups/PopupHost';
import { NOTICE_BOARD, NoticeList, RecentList } from './widgets/CommunityWidgets';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const REFRESH_QUERY_ROOTS = [['recent'], ['posts', NOTICE_BOARD], ['boards']] as const;

/** 당겨서 새로고침 — 공지·최신글을 다시 받고, 모두 끝날 때까지 스피너를 유지한다. */
function useHomeRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    const jobs = REFRESH_QUERY_ROOTS.map((queryKey) => qc.refetchQueries({ queryKey: [...queryKey] }));
    void Promise.allSettled(jobs).then(() => setRefreshing(false));
  };
  return { refreshing, refresh };
}

/** 최신글 행 → 서버 `href` 는 urlResolver(linkOpener)로, 없으면 bo_table/wr_id(양수만). */
function useOpenRecent() {
  const navigation = useNavigation<Navigation>();
  const openLink = useMenuLink();
  return useCallback(
    (item: RecentItemDto) => {
      if (item.href) void openLink(item.href);
      else if (item.bo_table && item.wr_id > 0)
        navigation.navigate('PostDetail', { board: item.bo_table, wr_id: item.wr_id });
    },
    [navigation, openLink],
  );
}

function CommunityHeader({ onWrite }: { onWrite: () => void }) {
  const { openDrawer } = useServiceMenu();
  return (
    <ServiceHeader
      title={useAppName()}
      service={t('home.service_community')}
      left={{ icon: 'menu', label: t('settings.boards'), onPress: () => openDrawer('left'), testID: 'home-menu' }}
      right={{ icon: 'pencil-outline', label: t('board.compose_new'), onPress: onWrite, testID: 'home-write' }}
      testID="home-header"
    />
  );
}

export function HomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Navigation>();
  const { refreshing, refresh } = useHomeRefresh();
  const openRecent = useOpenRecent();
  const openAllBoards = () => navigation.navigate('MainTabs', tabParams('CommunityTab'));
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="home-screen">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <CommunityHeader onWrite={openAllBoards} />
        <View style={styles.content}>
          <NoticeList
            onOpenPost={(wrId) => navigation.navigate('PostDetail', { board: NOTICE_BOARD, wr_id: wrId })}
            onMore={() => navigation.navigate('PostList', { board: NOTICE_BOARD })}
          />
          <RecentList onOpenPost={openRecent} onMore={() => navigation.navigate('MainTabs', tabParams('RecentTab'))} />
        </View>
      </ScrollView>
      <PopupHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SPACE[4], gap: SPACE[6], paddingBottom: SPACE[8] },
});
