/**
 * 내 정보 (PLAN T-P1A-08, PRD MB-08/MB-09) — `GET /members/me`(민감 필드 제외 전체), `PATCH /members/me`.
 * - 이메일을 바꾸려면 현재 비밀번호(`mb_password_current`)가 필요하고, 바뀐 이메일은 다시 인증 대기가 된다.
 * - 비밀번호 변경도 현재 비밀번호가 필요하며, 성공하면 서버가 이 회원의 **모든** refresh token 을 폐기한다
 *   (이 기기 포함) — 앱은 새 비밀번호로 바로 다시 로그인한다(AUTH-10).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../shared/api/client';

const text = z.string().catch('');

const profileSchema = z.looseObject({
  mb_id: z.string(),
  mb_nick: text,
  mb_name: text,
  mb_email: text,
  mb_hp: text,
  mb_tel: text,
  mb_zip1: text,
  mb_zip2: text,
  mb_addr1: text,
  mb_addr2: text,
  mb_signature: text,
  mb_profile: text,
  /** 회원이미지(프로필 사진) 주소 — 없으면 null. 서버가 아직 모르면(구버전) 빠진다. */
  mb_image_path: z.string().nullable().optional().catch(null),
});

export type MyProfile = z.infer<typeof profileSchema>;

export const PROFILE_FIELDS = [
  'mb_nick',
  'mb_name',
  'mb_email',
  'mb_hp',
  'mb_tel',
  'mb_zip1',
  'mb_zip2',
  'mb_addr1',
  'mb_addr2',
  'mb_signature',
  'mb_profile',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfilePatch = Partial<Record<ProfileField, string>> & { mb_password_current?: string };

export const myProfileKeys = { profile: ['me', 'profile'] as const };

export async function getMyProfile(): Promise<MyProfile> {
  const data = await api.get<unknown>('/members/me');
  const member = typeof data === 'object' && data !== null ? (data as { member?: unknown }).member : undefined;
  return profileSchema.parse(member);
}

export function useMyProfile(enabled: boolean): UseQueryResult<MyProfile> {
  return useQuery({ queryKey: myProfileKeys.profile, queryFn: getMyProfile, enabled });
}

export async function updateMyProfile(patch: ProfilePatch): Promise<void> {
  await api.patch<unknown>('/members/me', patch);
}

export async function changeMyPassword(input: { current: string; next: string; confirm: string }): Promise<void> {
  await api.patch<unknown>('/members/me', {
    mb_password_current: input.current,
    mb_password: input.next,
    mb_password_re: input.confirm,
  });
}
