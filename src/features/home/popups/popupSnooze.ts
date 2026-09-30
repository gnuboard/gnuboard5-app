/**
 * 팝업 스누즈 (PLAN T-P1A-13, PRD HM-01). "N시간 동안 보지 않기" 는 기기 로컬 설정 — AsyncStorage
 * `home.popupSnooze.v1` 에 `{ [nw_id]: 해제 시각(epoch ms) }` 로 둔다. `nw_disable_hours` 가 0 이면 하루로 본다.
 * 만료된 항목은 읽을 때 정리한다(무한 증가 방지).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const POPUP_SNOOZE_STORAGE_KEY = 'home.popupSnooze.v1';
export const DEFAULT_SNOOZE_HOURS = 24;
const MAX_SNOOZE_HOURS = 24 * 30;
const HOUR_MS = 60 * 60 * 1000;

export type SnoozeMap = Record<string, number>;

function parseStored(raw: string | null, now: number): SnoozeMap {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: SnoozeMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= now) continue;
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function snoozeUntil(hours: number, now: number): number {
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, MAX_SNOOZE_HOURS) : DEFAULT_SNOOZE_HOURS;
  return now + safeHours * HOUR_MS;
}

export async function loadPopupSnoozes(now: number = Date.now()): Promise<SnoozeMap> {
  try {
    return parseStored(await AsyncStorage.getItem(POPUP_SNOOZE_STORAGE_KEY), now);
  } catch {
    return {};
  }
}

/** 팝업 하나를 `nw_disable_hours` 만큼 숨긴다 — 저장 실패는 무시(다음 실행에 다시 보일 뿐). */
export async function snoozePopup(nwId: number, hours: number, now: number = Date.now()): Promise<SnoozeMap> {
  const next: SnoozeMap = { ...(await loadPopupSnoozes(now)), [String(nwId)]: snoozeUntil(hours, now) };
  try {
    await AsyncStorage.setItem(POPUP_SNOOZE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 로컬 편의 설정 — 실패해도 화면은 계속 동작한다. */
  }
  return next;
}

export function isSnoozed(snoozes: SnoozeMap, nwId: number, now: number): boolean {
  const until = snoozes[String(nwId)];
  return typeof until === 'number' && until > now;
}

/** 로드 시점에 만료분이 제거된 맵에서는 키 존재 = 숨김 — 렌더 중 시계를 읽지 않기 위한 순수 검사. */
export function hasSnooze(snoozes: SnoozeMap, nwId: number): boolean {
  return snoozes[String(nwId)] !== undefined;
}
