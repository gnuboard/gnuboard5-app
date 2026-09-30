/**
 * 첨부 파일 목록 (T-P1B-06, ARCH §8.7). 기존 파일(bf_no)·새 파일(로컬 URI)을 한 줄씩, 삭제 가능. 추가는 갤러리 Photo
 * Picker(이미지) — 문서 선택은 expo-document-picker 도입 전까지 미지원. 한도는 보드 `bo_upload_count/size`.
 */
import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { Attachment, NewAttachment } from '../../../entities/postFile/model';
import type { PostFileDto } from '../../../entities/postFile/schema';
import { safeUploadFileName } from '../../../entities/upload/api';
import { t } from '../../../shared/i18n';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';
import { inferImageUploadMimeType } from '../../../shared/lib/imageUpload';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface PickedFile {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
}

export interface AttachmentListProps {
  attachments: Attachment[];
  originalFiles: readonly PostFileDto[];
  maxCount: number;
  /** 바이트, 0 이면 무제한. */
  maxSize: number;
  disabled: boolean;
  onChange: (update: (prev: Attachment[]) => Attachment[]) => void;
  /** 테스트 주입용. */
  pick?: () => Promise<PickedFile | null>;
}

const defaultPick = (): Promise<PickedFile | null> =>
  pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 1, allowsEditing: false });

export function toNewAttachment(picked: PickedFile): NewAttachment {
  const name = safeUploadFileName(picked.fileName) ?? `photo-${Date.now()}.jpg`;
  const mimeType = inferImageUploadMimeType(picked.uri, name);
  const localId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { kind: 'new', localId, uri: picked.uri, name, mimeType };
}

export function attachmentLabel(item: Attachment, originalFiles: readonly PostFileDto[]): string {
  if (item.kind === 'new') return item.name;
  return originalFiles.find((file) => file.bf_no === item.bf_no)?.bf_source ?? `#${item.bf_no}`;
}

export function attachmentKey(item: Attachment): string {
  return item.kind === 'new' ? item.localId : `bf-${item.bf_no}`;
}

/** 크기 한도(바이트)를 넘으면 false — 한도 0 은 무제한. */
export function fitsUploadSize(picked: PickedFile, maxSize: number): boolean {
  return maxSize <= 0 || (picked.fileSize ?? 0) <= maxSize;
}

interface RowProps {
  item: Attachment;
  label: string;
  disabled: boolean;
  onRemove: () => void;
}

function AttachmentRow({ item, label, disabled, onRemove }: RowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]}>
      <AppText variant="bodySm" numberOfLines={1} style={styles.name}>
        {label}
      </AppText>
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('board.remove_attachment', { name: label })}
        hitSlop={8}
        testID={`compose-attachment-remove-${attachmentKey(item)}`}
      >
        <AppText variant="label" tone="error">
          ✕
        </AppText>
      </Pressable>
    </View>
  );
}

export function AttachmentList(props: AttachmentListProps) {
  const { attachments, originalFiles, maxCount, maxSize, disabled, onChange, pick = defaultPick } = props;
  const add = async () => {
    const picked = await pick();
    if (!picked) return;
    if (!fitsUploadSize(picked, maxSize)) {
      const mb = (maxSize / 1024 / 1024).toFixed(1);
      Alert.alert(t('board.file_too_large_title'), t('board.file_too_large_message', { mb }));
      return;
    }
    onChange((prev) => (prev.length >= maxCount ? prev : [...prev, toNewAttachment(picked)]));
  };
  return (
    <View style={styles.root} testID="compose-attachments">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {t('board.attachments_count', { n: attachments.length, max: maxCount })}
      </AppText>
      {attachments.map((item) => (
        <AttachmentRow
          key={attachmentKey(item)}
          item={item}
          label={attachmentLabel(item, originalFiles)}
          disabled={disabled}
          onRemove={() => onChange((prev) => prev.filter((entry) => attachmentKey(entry) !== attachmentKey(item)))}
        />
      ))}
      <Button
        label={t('board.add_attachment')}
        variant="secondary"
        size="compact"
        disabled={disabled || attachments.length >= maxCount}
        onPress={() => void add()}
        testID="compose-attachment-add"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[3],
    paddingVertical: SPACE[2],
  },
  name: { flex: 1 },
});
