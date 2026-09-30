/**
 * 상품/썸네일 이미지 — `image_url` 이 빈 문자열이거나 로드 실패면 자리표시 타일. 비율 고정(기본 1:1).
 */
import React, { useState } from 'react';
import { Image, StyleSheet, View, type ImageProps, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from './theme/ThemeProvider';
import { RADII } from './tokens/primitive';

export interface ProductImageProps extends Omit<ImageProps, 'source' | 'style'> {
  uri?: string | null;
  aspectRatio?: number;
  radius?: number;
  /** 자리표시 글자(예: 상품명 첫 글자). */
  placeholderLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProductImage({
  uri,
  aspectRatio = 1,
  radius = RADII.sm,
  placeholderLabel,
  style,
  accessibilityLabel,
  ...imageProps
}: ProductImageProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  return (
    <View
      style={[styles.frame, { aspectRatio, borderRadius: radius, backgroundColor: colors.surfaceContainer }, style]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? placeholderLabel}
    >
      {showImage ? (
        <Image
          {...imageProps}
          source={{ uri }}
          onError={() => setFailed(true)}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          resizeMode={imageProps.resizeMode ?? 'cover'}
        />
      ) : (
        <View style={styles.placeholder} testID="product-image-placeholder">
          <AppText variant="cardTitle" tone="onSurfaceDisabled">
            {placeholderLabel?.trim().slice(0, 1) || '·'}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
