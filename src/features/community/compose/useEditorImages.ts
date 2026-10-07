/**
 * 본문 이미지 업로드 (T-P1B-06, ARCH §8.6). 갤러리 Photo Picker → 1280px/jpeg 0.8 리사이즈 → `POST /upload` →
 * `<img src=file_url>` 삽입. 업로드한 URL 을 기억해 두었다가 취소·본문에서 제거된 것은 `POST /upload/delete` 로 정리(베스트에포트).
 * 카메라 촬영은 지원하지 않는다(PRD CM-04). 의존성은 테스트에서 주입한다.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useRef, useState } from 'react';
import { deleteUploadedImage, uploadImage } from '../../../entities/upload/api';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';
import { deleteTemporaryPhotoFile } from '../../../shared/lib/tempFiles';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { buildImageTag, imageUrlsMissingFromContent, insertTextAtSelection, type TextSelection } from './composeHtml';

export const UPLOAD_MAX_WIDTH = 1280;
export const UPLOAD_JPEG_QUALITY = 0.8;

export interface EditorImageDeps {
  pick: () => Promise<{ uri: string } | null>;
  resize: (uri: string) => Promise<{ uri: string }>;
  upload: (uri: string) => Promise<{ file_url: string }>;
  remove: (fileUrl: string) => Promise<unknown>;
  cleanupTemp: (uri: string | null, sourceUri: string | null) => Promise<void>;
}

export const defaultEditorImageDeps: EditorImageDeps = {
  pick: () => pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false }),
  resize: (uri) =>
    ImageManipulator.manipulateAsync(uri, [{ resize: { width: UPLOAD_MAX_WIDTH } }], {
      compress: UPLOAD_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }),
  upload: (uri) => uploadImage(uri),
  remove: (fileUrl) => deleteUploadedImage(fileUrl),
  cleanupTemp: (uri, sourceUri) => deleteTemporaryPhotoFile(uri, sourceUri),
};

export type AttachOutcome = { kind: 'inserted'; content: string } | { kind: 'cancelled' } | { kind: 'too_long' };

export interface EditorImages {
  uploading: boolean;
  /** 사진을 골라 업로드하고 커서 자리에 태그를 넣은 새 본문을 돌려준다. 실패는 throw. */
  attach: (content: string, selection: TextSelection) => Promise<AttachOutcome>;
  /** WYSIWYG 편집기용 — 사진을 골라 업로드하고 주소만 돌려준다(넣기는 편집기 명령). 취소면 null, 실패는 throw. */
  upload: () => Promise<string | null>;
  /** 본문에 남지 않은 업로드 이미지를 서버에서 지운다(저장 후·취소 시). */
  discardMissing: (content: string, extraCandidates?: Iterable<string>) => Promise<void>;
}

async function pickAndUpload(deps: EditorImageDeps): Promise<string | null> {
  const asset = await deps.pick();
  if (!asset) return null;
  let resizedUri: string | null = null;
  try {
    const resized = await deps.resize(asset.uri);
    resizedUri = resized.uri;
    return (await deps.upload(resized.uri)).file_url;
  } finally {
    await deps.cleanupTemp(resizedUri, asset.uri);
  }
}

export function useEditorImages(deps: EditorImageDeps = defaultEditorImageDeps): EditorImages {
  const [uploading, setUploading] = useState(false);
  const busy = useRef(false);
  const uploaded = useRef(new Set<string>());

  const attach = useCallback(
    async (content: string, selection: TextSelection): Promise<AttachOutcome> => {
      if (busy.current) return { kind: 'cancelled' };
      busy.current = true;
      setUploading(true);
      try {
        const fileUrl = await pickAndUpload(deps);
        if (!fileUrl) return { kind: 'cancelled' };
        const next = insertTextAtSelection(content, selection, buildImageTag(fileUrl));
        if (next.length > INPUT_LIMITS.postContent) {
          await deps.remove(fileUrl).catch(() => undefined);
          return { kind: 'too_long' };
        }
        uploaded.current.add(fileUrl);
        return { kind: 'inserted', content: next };
      } finally {
        busy.current = false;
        setUploading(false);
      }
    },
    [deps],
  );

  const upload = useCallback(async (): Promise<string | null> => {
    if (busy.current) return null;
    busy.current = true;
    setUploading(true);
    try {
      const fileUrl = await pickAndUpload(deps);
      if (fileUrl) uploaded.current.add(fileUrl);
      return fileUrl;
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }, [deps]);

  const discardMissing = useCallback(
    async (content: string, extraCandidates: Iterable<string> = []) => {
      const candidates = [...uploaded.current, ...extraCandidates];
      const orphans = imageUrlsMissingFromContent(candidates, content);
      await Promise.all(orphans.map((url) => deps.remove(url).catch(() => undefined)));
      for (const url of orphans) uploaded.current.delete(url);
    },
    [deps],
  );

  return { uploading, attach, upload, discardMissing };
}
