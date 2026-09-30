/**
 * 알림 채널 동기화 훅 (PLAN T-P1A-10). `cf_title`(useAppName) 이나 로케일이 바뀌면 채널 표시 이름을 갱신한다.
 * 채널 생성 자체는 첫 렌더에서 한 번 일어나며, 실패는 무시한다(다음 실행에서 다시 시도 — 알림 수신을 막지는 않는다).
 */
import { useEffect } from 'react';
import { useAppName } from '../../entities/settings/appName';
import { useSettingsQuery } from '../../entities/settings/queries';
import { useLocale } from '../../shared/i18n';
import { appLog } from '../../shared/lib/debug/appLog';
import { syncAndroidChannels } from './channels';

export function useAndroidChannels(): void {
  const appName = useAppName();
  const locale = useLocale();
  // 설정을 한 번도 받지 못한 첫 실행에서는 기다린다 — 폴백 이름으로 만들었다가 cf_title 이 오면 곧바로 다시 쓰게 된다.
  const pendingFirstLoad = useSettingsQuery().isPending;
  useEffect(() => {
    if (pendingFirstLoad) return;
    void syncAndroidChannels(appName, locale).catch((error: unknown) => {
      appLog.warn('PushChannel', 'channel sync failed', error);
    });
  }, [appName, locale, pendingFirstLoad]);
}
