/**
 * 법적 고지 링크 (PLAN T-P1A-12, ARCH §9 SC-05 `legal_urls`). 서버가 준 https URL 이 있으면 그것이 정본 —
 * 인앱 브라우저로 연다. 약관·개인정보는 서버 값이 없을 때만 앱 내장 텍스트(LegalTextScreen)로 폴백하고,
 * 나머지(탈퇴 안내·환불 정책)는 URL 이 없으면 항목 자체를 숨긴다.
 */
import type { PublicSettings } from '../../../entities/settings/api';
import { isHttpsUrl } from '../../../shared/lib/openExternalUrl';

export type LegalKind = 'terms' | 'privacy' | 'account_deletion' | 'refund';

export const LEGAL_KINDS: readonly LegalKind[] = ['terms', 'privacy', 'account_deletion', 'refund'];

/** 앱 내장 폴백 문서가 있는 항목(LegalTextScreen 의 `kind`). */
export const BUILT_IN_LEGAL_KINDS: readonly LegalKind[] = ['terms', 'privacy'];

export type LegalEntry =
  | { kind: LegalKind; mode: 'url'; url: string }
  | { kind: LegalKind; mode: 'builtin' }
  | { kind: LegalKind; mode: 'hidden' };

export function legalUrl(settings: PublicSettings | undefined, kind: LegalKind): string | null {
  const urls = settings?.legal_urls;
  if (typeof urls !== 'object' || urls === null) return null;
  const value = (urls as Record<string, unknown>)[kind];
  return isHttpsUrl(value) ? value.trim() : null;
}

export function legalEntry(settings: PublicSettings | undefined, kind: LegalKind): LegalEntry {
  const url = legalUrl(settings, kind);
  if (url) return { kind, mode: 'url', url };
  return BUILT_IN_LEGAL_KINDS.includes(kind) ? { kind, mode: 'builtin' } : { kind, mode: 'hidden' };
}

export function visibleLegalEntries(settings: PublicSettings | undefined): LegalEntry[] {
  return LEGAL_KINDS.map((kind) => legalEntry(settings, kind)).filter((entry) => entry.mode !== 'hidden');
}
