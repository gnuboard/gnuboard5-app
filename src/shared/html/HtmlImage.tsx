/**
 * 본문 이미지 (T-P1B-04). `Image.getSize` 결과를 모듈 캐시에 두어 같은 URL 은 한 번만 재고, 가용 폭에 맞춰 비율대로
 * 높이를 정한다. 외부 이미지(`data-external-src`)는 자동 로드하지 않고 '외부 이미지 보기' 플레이스홀더만 그린다.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { AppText } from '../ui/AppText';
import { useTheme } from '../ui/theme/ThemeProvider';
import { RADII, SPACE } from '../ui/tokens/primitive';

export interface ImageSize {
  width: number;
  height: number;
}

const sizeCache = new Map<string, ImageSize>();
const SIZE_CACHE_LIMIT = 200;

function rememberSize(uri: string, size: ImageSize): void {
  sizeCache.delete(uri);
  sizeCache.set(uri, size);
  if (sizeCache.size > SIZE_CACHE_LIMIT) sizeCache.delete(sizeCache.keys().next().value as string);
}
const DEFAULT_RATIO = 4 / 3;
const MAX_HEIGHT_RATIO = 3;

export function resetImageSizeCache(): void {
  sizeCache.clear();
}

/** 캐시 → 없으면 측정. 실패하면 기본 비율. */
export function useImageSize(uri: string): ImageSize | undefined {
  const [size, setSize] = useState<ImageSize | undefined>(() => sizeCache.get(uri));
  useEffect(() => {
    if (sizeCache.has(uri)) return undefined;
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => {
        const measured = { width, height };
        rememberSize(uri, measured);
        if (alive) setSize(measured);
      },
      () => {
        if (alive) setSize({ width: DEFAULT_RATIO, height: 1 });
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return size;
}

/** 폭에 맞춘 높이 — 세로로 너무 긴 이미지는 3:1 까지만 늘린다. */
export function fittedHeight(size: ImageSize | undefined, width: number): number {
  if (!size || size.width <= 0 || size.height <= 0) return Math.round(width / DEFAULT_RATIO);
  return Math.round(Math.min(width * (size.height / size.width), width * MAX_HEIGHT_RATIO));
}

export interface HtmlImageProps {
  uri: string;
  alt?: string;
  width: number;
  onPress?: (uri: string, alt: string | undefined) => void;
}

export function HtmlImage({ uri, alt, width, onPress }: HtmlImageProps) {
  const { colors } = useTheme();
  const size = useImageSize(uri);
  const height = fittedHeight(size, width);
  const image = (
    <Image
      source={{ uri }}
      style={[styles.image, { width, height, backgroundColor: colors.surfaceContainer }]}
      resizeMode="contain"
      accessibilityLabel={alt || t('html.image')}
      accessible
      testID="html-image"
    />
  );
  if (!onPress) return image;
  return (
    <Pressable
      onPress={() => onPress(uri, alt)}
      accessibilityRole="imagebutton"
      accessibilityLabel={alt || t('html.image')}
    >
      {image}
    </Pressable>
  );
}

export interface ExternalImagePlaceholderProps {
  url: string;
  alt?: string;
  onOpen?: (url: string) => void;
}

/** 외부 호스트 이미지 — 추적·혼합 콘텐츠 방지를 위해 자동 로드 금지(ARCH §8.4). */
export function ExternalImagePlaceholder({ url, alt, onOpen }: ExternalImagePlaceholderProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onOpen ? () => onOpen(url) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${t('html.external_image')}${alt ? ` · ${alt}` : ''}`}
      style={[styles.placeholder, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineSubtle }]}
      testID="html-external-image"
    >
      <View style={styles.placeholderBody}>
        <AppText variant="label" tone="link">
          {t('html.external_image')}
        </AppText>
        {alt ? (
          <AppText variant="caption" tone="onSurfaceCaption" numberOfLines={2}>
            {alt}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: RADII.sm, marginVertical: SPACE[2] },
  placeholder: {
    borderRadius: RADII.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACE[4],
    paddingHorizontal: SPACE[3],
    marginVertical: SPACE[2],
  },
  placeholderBody: { gap: SPACE[1], alignItems: 'center' },
});
