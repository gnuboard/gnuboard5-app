/**
 * 리뷰 사진 (PLAN T-P2-02) — 앨범에서 한 장씩 골라 1280px JPEG 로 줄여 `/upload` 에 올린다(최대 5장, 시스템 사진 선택기 —
 * 저장소 권한 없음). 이번에 올린 사진을 빼면 서버에서도 지운다(베스트에포트). 기존 리뷰의 사진은 목록에서만 뺀다.
 * 의존성은 주입(테스트) — 기본값은 게시판 글쓰기와 같은 선택·축소·업로드 경로.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { deleteUploadedImage, uploadImage } from '../../../entities/upload/api';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';
import { deleteTemporaryPhotoFile } from '../../../shared/lib/tempFiles';
import { REVIEW_PHOTO_MAX } from './reviewContent';

export interface ReviewPhotoDeps {
  pick: () => Promise<{ uri: string } | null>;
  resize: (uri: string) => Promise<{ uri: string }>;
  upload: (uri: string) => Promise<{ file_url: string }>;
  remove: (fileUrl: string) => Promise<unknown>;
  cleanupTemp: (uri: string | null, sourceUri: string | null) => Promise<void>;
}

export const defaultReviewPhotoDeps: ReviewPhotoDeps = {
  pick: () => pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false }),
  resize: (uri) =>
    ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1280 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
  upload: (uri) => uploadImage(uri),
  remove: (fileUrl) => deleteUploadedImage(fileUrl),
  cleanupTemp: (uri, sourceUri) => deleteTemporaryPhotoFile(uri, sourceUri),
};

export type AddPhotoOutcome = 'added' | 'cancelled' | 'full';

export function useReviewPhotos(initial: readonly string[], deps: ReviewPhotoDeps = defaultReviewPhotoDeps) {
  const [photos, setPhotos] = useState<string[]>(() => [...initial]);
  const [uploading, setUploading] = useState(false);
  const uploaded = useRef(new Set<string>());

  const add = async (): Promise<AddPhotoOutcome> => {
    if (photos.length >= REVIEW_PHOTO_MAX) return 'full';
    const asset = await deps.pick();
    if (!asset) return 'cancelled';
    setUploading(true);
    let resized: string | null = null;
    try {
      resized = (await deps.resize(asset.uri)).uri;
      const { file_url: url } = await deps.upload(resized);
      uploaded.current.add(url);
      setPhotos((current) => [...current, url].slice(0, REVIEW_PHOTO_MAX));
      return 'added';
    } finally {
      setUploading(false);
      await deps.cleanupTemp(resized, asset.uri);
    }
  };

  const remove = (url: string) => {
    setPhotos((current) => current.filter((item) => item !== url));
    if (uploaded.current.delete(url)) void deps.remove(url).catch(() => undefined);
  };

  return { photos, uploading, add, remove };
}
