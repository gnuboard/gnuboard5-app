/**
 * 전체 화면 사진 보기 — 상품 갤러리와 게시글 본문·첨부 사진이 함께 쓴다. 가로로 넘기고, 사진은 잘리지 않게(contain)
 * 화면에 맞춘다. 배경은 테마와 상관없이 검정(사진 보기의 관례).
 * `action` 은 위쪽 왼쪽 버튼 하나 — 게시글 사진의 "신고"(스토어 UGC 요건: 신고·차단) 같은, 보기와 다른 동작.
 */
import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useFrameDimensions } from '../web/frame';
import { Button } from './Button';
import { PALETTE, SPACE } from './tokens/primitive';

export interface ImageViewerAction {
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface ImageViewerProps {
  images: readonly string[];
  /** 처음 보여 줄 사진 번호. null 이면 닫혀 있다. */
  start: number | null;
  onClose: () => void;
  action?: ImageViewerAction;
  testID?: string;
  closeTestID?: string;
}

export function ImageViewer({
  images,
  start,
  onClose,
  action,
  testID = 'image-viewer',
  closeTestID = 'image-viewer-close',
}: ImageViewerProps) {
  const { width } = useFrameDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={start !== null} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID={testID}>
        <View style={styles.bar}>
          {action ? (
            <Button
              label={action.label}
              variant="secondary"
              size="compact"
              onPress={action.onPress}
              testID={action.testID}
            />
          ) : (
            <View />
          )}
          <Button label={t('common.close')} size="compact" onPress={onClose} testID={closeTestID} />
        </View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: (start ?? 0) * width, y: 0 }}
          style={styles.pager}
        >
          {images.map((uri, index) => (
            <View key={`${index}-${uri}`} style={[styles.page, { width }]}>
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={t('shop.image_viewer', { index: index + 1, total: images.length })}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.black },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE[4],
    paddingVertical: SPACE[2],
  },
  pager: { flex: 1 },
  page: { flex: 1, justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});
