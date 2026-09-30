/**
 * 사이트 메뉴(관리자 메뉴 설정, `GET /menus`) — 커뮤니티 왼쪽 서랍 안에 둔다. 목업 홈에는 메뉴 목록이 없어 홈에서 뺐지만,
 * 콘텐츠 페이지·외부 링크 같은 관리자 메뉴로 가는 길이 사라지지 않게 서랍으로 옮겼다. 링크는 urlResolver 판정을
 * 그대로 따른다(useMenuLink). 누르면 서랍을 닫고 이동한다.
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMenusQuery } from '../../../entities/menu/queries';
import { t } from '../../../shared/i18n';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { DrawerSection } from '../../../shared/ui/SideDrawer';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { MenuTree } from './MenuTree';
import { useMenuLink } from './useMenuLink';

function MenuBody({ onOpen }: { onOpen: (link: string) => void }) {
  const query = useMenusQuery();
  if (query.isPending) {
    return (
      <View style={styles.pad} testID="home-menus-skeleton">
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>
    );
  }
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) return <EmptyState title={t('home.menus_empty')} testID="home-menus-empty" />;
  return <MenuTree menus={query.data} onOpen={onOpen} />;
}

export function SiteMenuSection({ onClose }: { onClose: () => void }) {
  const openLink = useMenuLink();
  const onOpen = useCallback(
    (link: string) => {
      onClose();
      void openLink(link);
    },
    [onClose, openLink],
  );
  return (
    <DrawerSection title={t('home.site_menu')}>
      <MenuBody onOpen={onOpen} />
    </DrawerSection>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: SPACE[3], gap: SPACE[2] },
});
