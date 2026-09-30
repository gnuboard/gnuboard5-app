/**
 * 첨부 고르기 — "사진"(Photo Picker) 또는 "파일"(문서·압축, 시스템 문서 선택기) 중 하나를 묻고 고른 파일을 돌려준다.
 * 파일 선택기는 원래 파일명을 그대로 주지만, 안드로이드 사진 선택기는 이름을 번호(예: 1000000430.png)로 준다.
 *
 * E2E(EXPO_PUBLIC_E2E=1) 빌드에서는 시스템 선택기를 띄우지 않고 캐시에 만든 한글 이름 텍스트 파일을 돌려준다 —
 * Maestro 가 시스템 선택기를 다루지 못해 첨부 업로드 경로가 자동 테스트에서 빠져 있었다(2026-09-30 첨부 저장 실패를 놓침).
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { t } from '../../../shared/i18n';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';

export interface PickedFile {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}

type AttachmentSource = 'photo' | 'file';

/** E2E 가 올리는 파일 — 이름에 한글·공백을 넣어 파일명이 그대로 저장되는지도 본다. */
export const E2E_ATTACHMENT_NAME = 'E2E 첨부 파일.txt';

function chooseSource(): Promise<AttachmentSource | null> {
  return new Promise((resolve) => {
    Alert.alert(
      t('board.attach_source_title'),
      undefined,
      [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
        { text: t('board.attach_source_file'), onPress: () => resolve('file') },
        { text: t('board.attach_source_photo'), onPress: () => resolve('photo') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function pickPhoto(): Promise<PickedFile | null> {
  const asset = await pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  return asset
    ? { uri: asset.uri, fileName: asset.fileName, fileSize: asset.fileSize, mimeType: asset.mimeType }
    : null;
}

async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? { uri: asset.uri, fileName: asset.name, fileSize: asset.size, mimeType: asset.mimeType } : null;
}

async function e2eAttachment(): Promise<PickedFile> {
  const uri = `${FileSystem.cacheDirectory}e2e-attachment.txt`;
  const body = `E2E attachment ${new Date().toISOString()}\n`;
  await FileSystem.writeAsStringAsync(uri, body);
  return { uri, fileName: E2E_ATTACHMENT_NAME, fileSize: body.length, mimeType: 'text/plain' };
}

export async function pickAttachment(): Promise<PickedFile | null> {
  if (process.env.EXPO_PUBLIC_E2E === '1') return e2eAttachment();
  const source = await chooseSource();
  if (source === 'photo') return pickPhoto();
  if (source === 'file') return pickDocument();
  return null;
}
