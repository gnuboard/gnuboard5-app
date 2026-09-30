/**
 * 아이디·이메일 실시간 중복 검사 (PLAN T-P1A-05, PRD AUTH-06) — 입력이 멈추고 400ms 뒤 한 번. 형식이 틀린 값은
 * 서버에 묻지 않는다. 429(IP 열거 스로틀 10/분)를 받으면 이 화면에서는 더 묻지 않고 "가입할 때 다시 확인"으로 둔다 —
 * 제출은 막지 않는다(서버가 가입 시 다시 검사한다).
 */
import { useEffect, useState } from 'react';
import { checkAvailability, type AvailabilityField } from '../../../entities/session/registration';
import { ApiError } from '../../../shared/api/client';

export const AVAILABILITY_DEBOUNCE_MS = 400;
const HTTP_TOO_MANY_REQUESTS = 429;

export type AvailabilityState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken'; message: string }
  | { kind: 'paused' };

interface Checked {
  value: string;
  state: AvailabilityState;
}

/** 확인이 끝난 값의 결과. 입력이 바뀌면 바로 'checking'/'idle' 로 보인다(결과는 값에 묶여 있다). */
export function useAvailability(field: AvailabilityField, value: string, checkable: boolean): AvailabilityState {
  const [checked, setChecked] = useState<Checked | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!checkable || paused) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      checkAvailability(field, value).then(
        (result) => {
          if (!alive) return;
          const state: AvailabilityState = result.available
            ? { kind: 'available' }
            : { kind: 'taken', message: result.message ?? '' };
          setChecked({ value, state });
        },
        (error: unknown) => {
          if (!alive) return;
          if (error instanceof ApiError && error.status === HTTP_TOO_MANY_REQUESTS) setPaused(true);
          else setChecked({ value, state: { kind: 'idle' } });
        },
      );
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [field, value, checkable, paused]);

  if (paused) return { kind: 'paused' };
  if (!checkable) return { kind: 'idle' };
  return checked?.value === value ? checked.state : { kind: 'checking' };
}
