/**
 * 첨부 목록 (T-P1B-05, PRD CM-F03). 이미지(bf_type 1/2/3/18)는 `bf_url`(/v1/board-files) 로 인라인, 비이미지는
 * `bf_download_url` 을 downloadAttachment(ss_view 쿠키 헤더) 로 받아 공유 시트로 연다. 디스크에 없는 파일(bf_url '')은 비활성.
 */
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { APP_LINK_HOST } from '../../../config/appIds';
import { isDownloadable, isImageFile } from '../../../entities/postFile/model';
import type { PostFileDto } from '../../../entities/postFile/schema';
import { API_BASE, isApiError } from '../../../shared/api/client';
import { originOf } from '../../../shared/api/cookieStore';
import { HtmlImage } from '../../../shared/html/HtmlImage';
import { t } from '../../../shared/i18n';
import { downloadAttachment } from '../../../shared/lib/downloadAttachment';
import { AppText } from '../../../shared/ui/AppText';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';

export interface PostAttachmentsProps {
  files: readonly PostFileDto[];
  width: number;
  onImagePress?: (uri: string, alt: string | undefined) => void;
  /** 테스트 주입용. */
  download?: typeof downloadAttachment;
}

const ALLOWED_ORIGINS = [originOf(API_BASE), `https://${APP_LINK_HOST}`].filter(Boolean);

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

export function PostAttachments({ files, width, onImagePress, download = downloadAttachment }: PostAttachmentsProps) {
  const images = files.filter((file) => isImageFile(file) && file.bf_url);
  const others = files.filter((file) => !isImageFile(file));
  if (images.length === 0 && others.length === 0) return null;
  return (
    <View style={styles.root} testID="post-attachments">
      {images.map((file) => (
        <HtmlImage
          key={file.bf_no}
          uri={file.bf_url as string}
          alt={file.bf_content || file.bf_source}
          width={width}
          onPress={onImagePress}
        />
      ))}
      {others.length > 0 ? (
        <View style={styles.files}>
          <AppText variant="labelSm" tone="onSurfaceSecondary">
            {t('board.attachments', { n: others.length })}
          </AppText>
          {others.map((file) => (
            <AttachmentRow key={file.bf_no} file={file} download={download} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AttachmentRow({ file, download }: { file: PostFileDto; download: typeof downloadAttachment }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const url = file.bf_download_url || file.bf_url || '';
  const enabled = isDownloadable(file) && url !== '';
  const onPress = async () => {
    setBusy(true);
    try {
      await download({ url, fileName: file.bf_source }, ALLOWED_ORIGINS);
    } catch (error: unknown) {
      const session = isApiError(error) && error.code === 'SESSION';
      Alert.alert(t('board.download_failed'), t(session ? 'board.download_session' : 'board.download_failed_body'));
    } finally {
      setBusy(false);
    }
  };
  const meta = busy
    ? t('common.loading')
    : `${formatBytes(file.bf_filesize)} · ${t('board.download_count', { n: file.bf_download })}`;
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={!enabled || busy}
      accessibilityRole="button"
      accessibilityLabel={t('board.download_label', { name: file.bf_source })}
      accessibilityState={{ disabled: !enabled || busy, busy }}
      style={[styles.file, { borderColor: colors.outlineSubtle, opacity: enabled ? 1 : 0.5 }]}
      testID={`post-attachment-${file.bf_no}`}
    >
      <AppText variant="body" tone={enabled ? 'link' : 'onSurfaceDisabled'} numberOfLines={1} style={styles.fileName}>
        {file.bf_source}
      </AppText>
      <AppText variant="caption" tone="onSurfaceCaption">
        {meta}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: SPACE[4], paddingBottom: SPACE[3], gap: SPACE[2] },
  files: { gap: SPACE[2], paddingTop: SPACE[2] },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADII.sm,
    paddingVertical: SPACE[2],
    paddingHorizontal: SPACE[3],
  },
  fileName: { flex: 1 },
});
