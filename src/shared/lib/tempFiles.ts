/**
 * 임시 파일 정리 — dday-app `storage/photos.ts` 에서 커뮤니티 업로드에 필요한 부분만 승계.
 * (expo-file-system 19: `downloadAsync` 등 구 API는 `expo-file-system/legacy` 서브패스에만 남음 — PLAN R10)
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

function isChildFileUri(uri: string | null | undefined, dir: string | null | undefined): boolean {
  const trimmed = uri?.trim();
  const base = dir?.trim();
  if (!trimmed || !base) return false;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  if (!trimmed.startsWith(normalizedBase)) return false;
  const relative = trimmed.slice(normalizedBase.length);
  if (!relative || relative.includes('\\')) return false;
  try {
    const decoded = decodeURIComponent(relative);
    return decoded.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
  } catch {
    return false;
  }
}

/** 리사이즈 결과 같은 캐시 디렉터리 안의 임시 파일만 지운다. 원본(sourceUri)이나 캐시 밖 파일은 건드리지 않는다. */
export async function deleteTemporaryPhotoFile(
  uri: string | undefined | null,
  sourceUri?: string | null,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const trimmed = uri?.trim();
  if (!trimmed || trimmed === sourceUri?.trim()) return;
  if (!isChildFileUri(trimmed, FileSystem.cacheDirectory)) return;
  try {
    await FileSystem.deleteAsync(trimmed, { idempotent: true });
  } catch {
    // Best effort cache cleanup only.
  }
}
