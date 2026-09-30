/**
 * 16:9 배너 캐러셀 (PLAN T-P1C-02/12) — 쇼핑 홈과 포털 홈이 함께 쓴다(feature 끼리 import 금지라 shared 에 둔다).
 * 한 장씩 넘기는 가로 페이지, 링크 없는 배너는 누를 수 없다, 2장 이상이면 `n/총` 표시. 링크 해석은 호출자(linkOpener).
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { t } from '../i18n';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';
import { useTheme } from './theme/ThemeProvider';
import { RADII, SPACE } from './tokens/primitive';
import { useFrameDimensions } from '../web/frame';

export const BANNER_RATIO = 16 / 9;
const GUTTER = SPACE[4];

/** 배너 한 장 — entities/banner 의 Banner 와 구조가 같다. */
export interface BannerSlide {
  id: number;
  alt: string;
  url: string;
  imageUrl: string;
}

/** 스크롤 위치 → 현재 배너 번호(0부터, 범위 밖은 잘라낸다). */
export function bannerIndex(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / pageWidth)));
}

interface Props {
  banners: readonly BannerSlide[];
  onOpen: (url: string) => void;
  /** testID 접두사 — `${prefix}-banners`, `${prefix}-banner-${id}`. */
  testIDPrefix?: string;
}

export function BannerCarousel({ banners, onOpen, testIDPrefix = 'shop' }: Props) {
  const { width } = useFrameDimensions();
  const [index, setIndex] = useState(0);
  const { colors } = useTheme();
  if (!banners.length) return null;
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(bannerIndex(e.nativeEvent.contentOffset.x, width, banners.length));
  return (
    <View testID={`${testIDPrefix}-banners`}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd}>
        {banners.map((banner, i) => (
          <Pressable
            key={banner.id}
            onPress={() => banner.url && onOpen(banner.url)}
            disabled={!banner.url}
            accessibilityRole={banner.url ? 'link' : 'image'}
            accessibilityLabel={banner.alt || t('shop_home.banner', { n: i + 1, total: banners.length })}
            style={{ width, paddingHorizontal: GUTTER }}
            testID={`${testIDPrefix}-banner-${banner.id}`}
          >
            <ProductImage uri={banner.imageUrl} aspectRatio={BANNER_RATIO} radius={RADII.md} />
          </Pressable>
        ))}
      </ScrollView>
      {banners.length > 1 ? (
        // 시안(Claude Design v2): 배너 오른쪽 아래 안쪽의 어두운 알약.
        <View style={[styles.counter, { backgroundColor: colors.scrim }]} pointerEvents="none">
          <AppText variant="labelSm" weight="700" tone="inverseOnSurface" testID={`${testIDPrefix}-banner-counter`}>
            {`${index + 1}/${banners.length}`}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    right: GUTTER + SPACE[2],
    bottom: SPACE[2],
    borderRadius: 999,
    paddingHorizontal: SPACE[2],
    paddingVertical: 2,
  },
});
