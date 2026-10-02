/**
 * 회원이미지(프로필 사진) — 그누보드 "회원이미지"(data/member_image). 관리자 기본환경의 용량·가로·세로가 모두 0 보다 크고
 * 회원 레벨이 회원아이콘 레벨(cf_icon_level) 이상일 때만 쓴다(`GET /settings` member_media.image).
 * 서버는 설정 크기보다 큰 그림을 가운데 잘라 줄이지만 **용량은 올린 파일 그대로** 검사하므로(기본 50,000바이트),
 * 앱이 먼저 설정 비율로 잘라 설정 크기로 줄여서 보낸다(features/mypage/profile/memberImagePrep.ts).
 */
import { z } from 'zod';
import { request } from '../../shared/api/client';
import { appendFormFile } from '../../shared/api/formFile';
import { memberMediaSchema } from '../settings/schema';

export interface MemberImageRules {
  /** 바이트. */
  size: number;
  width: number;
  height: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const UPLOAD_TIMEOUT_MS = 60_000;

const uploadResultSchema = z.looseObject({ mb_image_path: z.string().nullable().optional() });

/** 이 회원이 회원이미지를 쓸 수 있으면 그 규칙, 아니면 null(설정이 꺼졌거나 레벨이 낮거나 서버가 아직 모름). */
export function memberImageRules(
  settings: Readonly<Record<string, unknown>> | undefined,
  member: { mb_level?: number } | null,
): MemberImageRules | null {
  // /settings 는 느슨한 객체로 캐시되므로 여기서 모양을 확인한다(틀리면 기능을 끈다).
  const media = memberMediaSchema.safeParse(settings?.member_media);
  const rule = media.success ? media.data.image : undefined;
  if (!rule?.enabled || !member) return null;
  if ((member.mb_level ?? 0) < rule.level) return null;
  if (rule.size <= 0 || rule.width <= 0 || rule.height <= 0) return null;
  return { size: rule.size, width: rule.width, height: rule.height };
}

/** 원본에서 목표 비율(가로:세로)로 가운데를 잘라 낼 영역. */
export function centerCropRect(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropRect {
  const ratio = targetWidth / targetHeight;
  if (srcWidth / srcHeight > ratio) {
    const width = Math.round(srcHeight * ratio);
    return { originX: Math.floor((srcWidth - width) / 2), originY: 0, width, height: srcHeight };
  }
  const height = Math.round(srcWidth / ratio);
  return { originX: 0, originY: Math.floor((srcHeight - height) / 2), width: srcWidth, height };
}

/** 준비된(잘라 줄인) JPEG 를 올리고 새 회원이미지 주소를 돌려준다. */
export async function uploadMemberImage(uri: string): Promise<string | null> {
  const form = new FormData();
  await appendFormFile(form, 'mb_img', { uri, name: 'profile.jpg', type: 'image/jpeg' });
  const result = await request('/members/me/image', {
    method: 'POST',
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    schema: uploadResultSchema,
  });
  return result.mb_image_path ?? null;
}

export async function deleteMemberImage(): Promise<void> {
  await request('/members/me/image', { method: 'DELETE' });
}
