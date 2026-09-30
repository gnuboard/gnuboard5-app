/**
 * 사이트 메뉴 2단 트리 (PLAN T-P1A-13, PRD HM-01) — 커뮤니티 서랍 안에서 서랍 줄 모양(Claude Design v2)으로 그린다.
 * 1단은 눌러서 펼치고(자식이 없으면 바로 이동), 2단은 들여 쓴 줄로 링크 이동한다. 링크 없는 항목은 눌러도 아무 일 없다.
 * 링크 해석·이동은 useMenuLink 가 맡는다(외부 URL 은 브라우저, 미구현 화면은 "준비 중").
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import type { MenuDto } from '../../../entities/menu/schema';
import { DrawerRow } from '../../../shared/ui/SideDrawer';

export interface MenuTreeProps {
  menus: readonly MenuDto[];
  onOpen: (link: string) => void;
}

function hasLink(item: { me_link: string }): boolean {
  return item.me_link.trim().length > 0;
}

interface SectionProps {
  menu: MenuDto;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (link: string) => void;
}

function MenuSection({ menu, expanded, onToggle, onOpen }: SectionProps) {
  const children = menu.children;
  const onPress = () => {
    if (children.length > 0) onToggle();
    else if (hasLink(menu)) onOpen(menu.me_link);
  };
  const accessory = children.length > 0 ? (expanded ? 'collapse' : 'expand') : undefined;
  return (
    <View>
      <DrawerRow
        icon="apps-outline"
        label={menu.me_name}
        accessory={accessory}
        onPress={onPress}
        testID={`menu-${menu.me_id}`}
      />
      {expanded && children.length > 0 ? (
        <View testID={`menu-children-${menu.me_id}`}>
          {children.map((child) => (
            <DrawerRow
              key={child.me_id}
              nested
              label={child.me_name}
              onPress={() => {
                if (hasLink(child)) onOpen(child.me_link);
              }}
              testID={`menu-child-${child.me_id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function MenuTree({ menus, onOpen }: MenuTreeProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  return (
    <View testID="home-menus">
      {menus.map((menu) => (
        <MenuSection
          key={menu.me_id}
          menu={menu}
          expanded={expandedId === menu.me_id}
          onToggle={() => setExpandedId((prev) => (prev === menu.me_id ? null : menu.me_id))}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}
