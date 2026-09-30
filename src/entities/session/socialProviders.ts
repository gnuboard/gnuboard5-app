/**
 * 로그인 화면의 소셜 버튼 목록 (PLAN T-P1A-03, ARCH §6.3) — 서버 `GET /auth/social/providers` 가 정본이다.
 * `enabled && has_api_key && !native_only` 이고 앱이 아는 제공자만 웹 브리지 버튼으로 보인다. iOS 는 MVP 에서
 * 웹 브리지 소셜 로그인을 제공하지 않으므로 빈 목록이다 — iOS 는 Apple(SC-11)만 selectAppleProvider 로 따로 판정한다.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../shared/api/client';
import type { SocialProvider } from './socialLogin';

const KNOWN_PROVIDERS: readonly SocialProvider[] = ['kakao', 'naver', 'google', 'facebook', 'twitter', 'payco'];
const PROVIDERS_STALE_MS = 10 * 60_000;

const providerSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  has_api_key: z.boolean().optional(),
  native_only: z.boolean().optional(),
});

const providersResponseSchema = z.object({
  enabled: z.boolean().optional(),
  providers: z.array(z.unknown()).optional(),
});

export interface SocialProviderInfo {
  id: SocialProvider;
  label: string;
}

function isKnownProvider(name: string): name is SocialProvider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(name);
}

/** 서버 응답 → 버튼으로 보일 제공자. 형식이 틀린 항목은 버리고, 전체가 틀리면 빈 목록. */
export function selectLoginProviders(raw: unknown, platform: string): SocialProviderInfo[] {
  if (platform === 'ios') return [];
  const parsed = providersResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.enabled === false) return [];
  const seen = new Set<SocialProvider>();
  const result: SocialProviderInfo[] = [];
  for (const item of parsed.data.providers ?? []) {
    const provider = providerSchema.safeParse(item);
    if (!provider.success) continue;
    const { name, label, has_api_key: hasKey, native_only: nativeOnly } = provider.data;
    if (!isKnownProvider(name) || hasKey !== true || nativeOnly === true || seen.has(name)) continue;
    seen.add(name);
    result.push({ id: name, label: label?.trim() || name });
  }
  return result;
}

/** 서버가 Apple(SC-11, native_only)을 켜고 자격증명까지 갖췄는가 — iOS 네이티브 버튼 노출 조건의 서버 쪽 절반. */
export function selectAppleProvider(raw: unknown): boolean {
  const parsed = providersResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.enabled === false) return false;
  return (parsed.data.providers ?? []).some((item) => {
    const provider = providerSchema.safeParse(item);
    return provider.success && provider.data.name === 'apple' && provider.data.has_api_key === true;
  });
}

export async function getSocialProviders(platform: string): Promise<SocialProviderInfo[]> {
  return selectLoginProviders(await api.get<unknown>('/auth/social/providers'), platform);
}

export const socialProviderKeys = { all: ['social-providers'] as const };

export function useAppleProviderEnabled(enabled: boolean): UseQueryResult<boolean> {
  return useQuery({
    queryKey: [...socialProviderKeys.all, 'apple'],
    queryFn: async () => selectAppleProvider(await api.get<unknown>('/auth/social/providers')),
    enabled,
    staleTime: PROVIDERS_STALE_MS,
  });
}

export function useSocialProviders(platform: string): UseQueryResult<SocialProviderInfo[]> {
  return useQuery({
    queryKey: [...socialProviderKeys.all, platform],
    queryFn: () => getSocialProviders(platform),
    // iOS 는 앱 안 목록 대신 안내만 보이고, 웹 데모는 소셜 로그인을 숨긴다 — 둘 다 목록을 부르지 않는다.
    enabled: platform !== 'ios' && platform !== 'web',
    staleTime: PROVIDERS_STALE_MS,
  });
}
