/**
 * 커뮤니티 왼쪽 서랍 (design/mockups/adaptive-navigation) — 검색 칸, 앱 이름, 최신글·전체 게시판, 그룹별 게시판,
 * 사이트 메뉴, 고객 지원, 쇼핑으로 이동, 설정. 게시판을 누르면 게시판 목록 화면과 같은 입장 검사(useBoardEntry)를 거친다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { filterBoards } from '../../../entities/board/model';
import { useBoardGroupsQuery, useBoardsQuery } from '../../../entities/board/queries';
import type { BoardDto } from '../../../entities/board/schema';
import { useAppName } from '../../../entities/settings/appName';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import {
  DrawerBrand,
  DrawerJumpCard,
  DrawerRow,
  DrawerSearchField,
  DrawerSection,
} from '../../../shared/ui/SideDrawer';
import { groupsFrom } from '../boards/BoardsScreen';
import { useHiddenBoards } from '../../../entities/board/hiddenBoards';
import { useBoardEntry } from '../boards/useBoardEntry';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Go = (action: () => void) => () => void;

export interface CommunityMenuProps {
  onClose: () => void;
  shopEnabled: boolean;
  /** 게시판 목록 아래에 붙일 사이트 메뉴(관리자 메뉴) — 홈 기능이라 셸(MainTabs)이 넘긴다. */
  siteMenu?: React.ReactNode;
}

interface BoardGroupRows {
  gr_id: string;
  title: string;
  boards: BoardDto[];
}

/** 순수: 보이는 게시판을 그룹 순서대로 묶는다(빈 그룹은 뺀다). */
export function groupBoards(
  boards: readonly BoardDto[],
  groups: readonly { gr_id: string; gr_subject: string }[],
): BoardGroupRows[] {
  return groups
    .map((group) => ({
      gr_id: group.gr_id,
      title: group.gr_subject,
      boards: boards.filter((board) => board.gr_id === group.gr_id),
    }))
    .filter((group) => group.boards.length > 0);
}

function useMenuBoards(): BoardGroupRows[] {
  const boards = useBoardsQuery();
  const groups = useBoardGroupsQuery();
  const { hidden, hydrated } = useHiddenBoards();
  return useMemo(() => {
    if (!hydrated || !boards.data) return [];
    const visible = filterBoards(boards.data, { exclude: [...hidden] });
    return groupBoards(visible, groupsFrom(visible, groups.data));
  }, [boards.data, groups.data, hidden, hydrated]);
}

function CommunityLinks({ go, navigation, onClose }: { go: Go; navigation: Navigation; onClose: () => void }) {
  const appName = useAppName();
  return (
    <>
      <DrawerSearchField
        placeholder={t('menu.community_search')}
        onPress={go(() => navigation.navigate('Search', {}))}
        testID="menu-community-search"
      />
      <DrawerBrand title={appName} service={t('home.service_community')} onClose={onClose} />
      <DrawerSection title={t('common.community')}>
        <DrawerRow
          icon="time-outline"
          label={t('recent.title')}
          onPress={go(() => navigation.navigate('MainTabs', tabParams('RecentTab')))}
        />
        <DrawerRow
          icon="document-text-outline"
          label={t('menu.all_boards')}
          onPress={go(() => navigation.navigate('MainTabs', tabParams('CommunityTab')))}
          testID="menu-all-boards"
        />
      </DrawerSection>
    </>
  );
}

function CommunityFooter({ go, navigation, shopEnabled }: { go: Go; navigation: Navigation; shopEnabled: boolean }) {
  return (
    <>
      <DrawerSection title={t('common.support')}>
        <DrawerRow icon="help-circle-outline" label={t('faq.title')} onPress={go(() => navigation.navigate('Faq'))} />
        <DrawerRow icon="headset-outline" label={t('qa.title')} onPress={go(() => navigation.navigate('Qas'))} />
      </DrawerSection>
      {shopEnabled ? (
        <DrawerJumpCard
          icon="bag-handle-outline"
          label={t('tab.shop_jump')}
          onPress={go(() => navigation.navigate('MainTabs', tabParams('ShopTab')))}
          testID="menu-jump-shop"
        />
      ) : null}
      <DrawerSection divider>
        <DrawerRow
          icon="settings-outline"
          accessory="chevron"
          label={t('common.settings')}
          onPress={go(() => navigation.navigate('MainTabs', tabParams('MyTab')))}
          testID="menu-settings"
        />
      </DrawerSection>
    </>
  );
}

export function CommunityMenu({ onClose, shopEnabled, siteMenu }: CommunityMenuProps) {
  const navigation = useNavigation<Navigation>();
  const enter = useBoardEntry(navigation);
  const groups = useMenuBoards();
  const go: Go = (action) => () => {
    onClose();
    action();
  };
  return (
    <>
      <CommunityLinks go={go} navigation={navigation} onClose={onClose} />
      {groups.map((group) => (
        <DrawerSection key={group.gr_id} title={`${t('settings.boards')} · ${group.title}`}>
          {group.boards.map((board) => (
            <DrawerRow
              key={board.bo_table}
              label={board.bo_mobile_subject || board.bo_subject}
              value={board.bo_count_write ? board.bo_count_write.toLocaleString() : undefined}
              onPress={go(() => enter(board.bo_table))}
              testID={`menu-board-${board.bo_table}`}
            />
          ))}
        </DrawerSection>
      ))}
      {siteMenu}
      <CommunityFooter go={go} navigation={navigation} shopEnabled={shopEnabled} />
    </>
  );
}
