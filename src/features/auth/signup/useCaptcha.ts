/**
 * 가입 캡차 (PLAN T-P1A-05) — 이미지(세션 쿠키 포함 fetch → data URI)와 음성(`/captcha/audio`, 접근성 대안).
 * 새로고침은 nonce 를 올려 이미지를 다시 받으며, 서버 세션의 캡차 키도 바뀌므로 입력값도 비운다(호출자).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { captchaAudioSource, fetchCaptchaImageUri } from '../../../entities/captcha/api';

interface Loaded {
  nonce: number;
  uri: string | null;
}

export interface CaptchaState {
  nonce: number;
  uri: string | null;
  loading: boolean;
  failed: boolean;
  reload(): void;
}

export function useCaptcha(): CaptchaState {
  const [nonce, setNonce] = useState(() => Date.now());
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCaptchaImageUri(nonce).then(
      (uri) => alive && setLoaded({ nonce, uri }),
      () => alive && setLoaded({ nonce, uri: null }),
    );
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((previous) => Math.max(Date.now(), previous + 1)), []);
  const loading = loaded?.nonce !== nonce;
  const uri = loading ? null : (loaded?.uri ?? null);
  return { nonce, uri, loading, failed: !loading && uri === null, reload };
}

/** 음성 캡차 재생. 이전 재생은 멈추고 해제한다. 실패는 false(화면이 안내). */
export function useCaptchaAudio(nonce: number): { play(): Promise<boolean> } {
  const player = useRef<AudioPlayer | null>(null);

  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );

  const play = useCallback(async () => {
    player.current?.remove();
    player.current = null;
    let created: AudioPlayer | null = null;
    try {
      created = createAudioPlayer(await captchaAudioSource(nonce));
      created.play();
      player.current = created;
      return true;
    } catch {
      // 만든 뒤 재생에서 실패해도 네이티브 플레이어는 해제한다.
      created?.remove();
      return false;
    }
  }, [nonce]);

  return { play };
}
