/**
 * 쇼핑 왼쪽 서랍 (design/mockups/adaptive-navigation) — 상품 검색 칸, 앱 이름, 접고 펴는 상품 분류, 상품 유형, 기획전·쿠폰존,
 * 커뮤니티로 이동, 설정. 1차 분류를 누르면 하위 분류를 펼치고, '전체'·하위 분류는 상품 목록으로 간다.
 */
import type { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCategoryTreeQuery } from '../../../entities/category/api';
import type { CategoryNode } from '../../../entities/category/model';
import { useAppName } from '../../../entities/settings/appName';
import { tabParams, type RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { Chip } from '../../../shared/ui/Chip';
import {
  DrawerBrand,
  DrawerJumpCard,
  DrawerRow,
  DrawerSearchField,
  DrawerSection,
} from '../../../shared/ui/SideDrawer';
import { SPACE } from '../../../shared/ui/tokens/primitive';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Go = (action: () => void) => () => void;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** 영카트 상품 유형 it_type1~5 (히트·추천·신상품·인기·할인) — 칩 아이콘은 Claude Design v2 서랍을 따른다. */
const PRODUCT_TYPES: readonly { type: 1 | 2 | 3 | 4 | 5; icon: IoniconName }[] = [
  { type: 1, icon: 'flame-outline' },
  { type: 2, icon: 'thumbs-up-outline' },
  { type: 3, icon: 'sparkles-outline' },
  { type: 4, icon: 'star' },
  { type: 5, icon: 'pricetag-outline' },
];

export interface ShopMenuProps {
  onClose: () => void;
}

function CategoryGroup({
  node,
  open,
  onToggle,
  onOpen,
}: {
  node: CategoryNode;
  open: boolean;
  onToggle: () => void;
  onOpen: (caId: string) => void;
}) {
  if (node.children.length === 0) {
    return <DrawerRow label={node.ca_name} onPress={() => onOpen(node.ca_id)} testID={`menu-category-${node.ca_id}`} />;
  }
  return (
    <>
      <DrawerRow
        label={node.ca_name}
        accessory={open ? 'collapse' : 'expand'}
        selected={open}
        onPress={onToggle}
        testID={`menu-category-${node.ca_id}`}
      />
      {open ? (
        <View>
          <DrawerRow nested label={t('menu.category_all')} onPress={() => onOpen(node.ca_id)} />
          {node.children.map((child) => (
            <DrawerRow
              key={child.ca_id}
              nested
              label={child.ca_name}
              onPress={() => onOpen(child.ca_id)}
              testID={`menu-category-${child.ca_id}`}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function ShopFooter({ go, navigation }: { go: Go; navigation: Navigation }) {
  return (
    <>
      <DrawerSection title={t('shop.filter_type')}>
        <View style={styles.types}>
          {PRODUCT_TYPES.map(({ type, icon }) => (
            <Chip
              key={type}
              icon={icon}
              label={t(`shop.type_${type}`)}
              onPress={go(() => navigation.navigate('ProductList', { it_type: type }))}
              testID={`menu-type-${type}`}
            />
          ))}
        </View>
      </DrawerSection>
      <DrawerSection title={t('shop_home.events')}>
        <DrawerRow icon="image-outline" label={t('event.title')} onPress={go(() => navigation.navigate('Events'))} />
        <DrawerRow
          icon="ticket-outline"
          label={t('coupon.zone_title')}
          onPress={go(() => navigation.navigate('CouponZone'))}
        />
      </DrawerSection>
      <DrawerJumpCard
        icon="chatbubble-outline"
        label={t('common.community')}
        onPress={go(() => navigation.navigate('MainTabs', tabParams('HomeTab')))}
        testID="menu-jump-community"
      />
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

export function ShopMenu({ onClose }: ShopMenuProps) {
  const navigation = useNavigation<Navigation>();
  const tree = useCategoryTreeQuery();
  const appName = useAppName();
  const [expanded, setExpanded] = useState<string | null>(null);
  const go: Go = (action) => () => {
    onClose();
    action();
  };
  const openCategory = (caId: string) => go(() => navigation.navigate('ProductList', { ca_id: caId }))();
  return (
    <>
      <DrawerSearchField
        placeholder={t('menu.shop_search')}
        onPress={go(() => navigation.navigate('ProductSearch'))}
        testID="menu-shop-search"
      />
      <DrawerBrand title={appName} service={t('home.service_shop')} onClose={onClose} />
      <DrawerSection title={t('shop_home.categories')}>
        {(tree.data ?? []).map((node) => (
          <CategoryGroup
            key={node.ca_id}
            node={node}
            open={expanded === node.ca_id}
            onToggle={() => setExpanded((current) => (current === node.ca_id ? null : node.ca_id))}
            onOpen={openCategory}
          />
        ))}
      </DrawerSection>
      <ShopFooter go={go} navigation={navigation} />
    </>
  );
}

const styles = StyleSheet.create({
  types: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE[2],
    paddingHorizontal: SPACE[3],
    paddingBottom: SPACE[2],
  },
});
