/**
 * 홈 팝업 (PLAN T-P1A-13, PRD HM-01). 서버가 노출 기간(`nw_begin/end_time`)으로 이미 걸러 주므로 앱은 로컬 스누즈만
 * 본다. 한 번에 하나씩 보여 주고 닫으면 다음 팝업으로 넘어간다. 본문은 `nw_content_html` 이면 content 정책 HTML,
 * 아니면 평문. "N시간 동안 보지 않기" 는 AsyncStorage(popupSnooze).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { usePopupsQuery } from '../../../entities/popup/queries';
import type { PopupDto } from '../../../entities/popup/schema';
import { HtmlContent } from '../../../shared/html/HtmlContent';
import { PlainTextBody } from '../../../shared/html/PlainTextBody';
import { t } from '../../../shared/i18n';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { DEFAULT_SNOOZE_HOURS, hasSnooze, loadPopupSnoozes, snoozePopup, type SnoozeMap } from './popupSnooze';
import { useFrameDimensions } from '../../../shared/web/frame';

const CARD_INSET = SPACE[4] * 2;
/**
 * 서버(`/shop/popups`)는 `both`·`shop` 구분만 준다. 홈은 공용(`both`, 빈 값은 구 데이터), 쇼핑 홈은 `shop` 전용을
 * 띄운다 — 같은 팝업이 두 탭에서 두 번 뜨지 않게.
 */
export const HOME_DIVISIONS: readonly string[] = ['both', ''];
export const SHOP_DIVISIONS: readonly string[] = ['shop'];

/** 만료된 스누즈는 loadPopupSnoozes 가 이미 버렸으므로 여기서는 키 존재만 본다(렌더 중 시계를 읽지 않는다). */
export function visiblePopups(
  popups: readonly PopupDto[],
  snoozes: SnoozeMap,
  divisions: readonly string[] = HOME_DIVISIONS,
): PopupDto[] {
  return popups.filter((popup) => divisions.includes(popup.nw_division ?? '') && !hasSnooze(snoozes, popup.nw_id));
}

/** 0(=기본)·24 시간만 "오늘 하루" — 48·72 처럼 더 긴 설정은 실제 시간을 보여 준다. */
export function snoozeLabel(popup: PopupDto): string {
  const hours = popup.nw_disable_hours > 0 ? popup.nw_disable_hours : DEFAULT_SNOOZE_HOURS;
  return hours === DEFAULT_SNOOZE_HOURS ? t('popup.hide_today') : t('popup.hide_hours', { n: hours });
}

function PopupBody({ popup, width }: { popup: PopupDto; width: number }) {
  if (popup.nw_content_html === 1 && popup.nw_content.trim()) {
    return <HtmlContent html={popup.nw_content} width={width} testID="popup-html" />;
  }
  const text = popup.nw_content_text.trim() || popup.nw_content;
  return <PlainTextBody text={text} testID="popup-text" />;
}

interface CardProps {
  popup: PopupDto;
  width: number;
  onClose: () => void;
  onSnooze: () => void;
}

function PopupCard({ popup, width, onClose, onSnooze }: CardProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surface }]} testID={`popup-${popup.nw_id}`}>
        {popup.nw_subject ? (
          <AppText variant="cardTitle" accessibilityRole="header" testID="popup-subject">
            {popup.nw_subject}
          </AppText>
        ) : null}
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <PopupBody popup={popup} width={width} />
        </ScrollView>
        <View style={styles.actions}>
          <Button
            label={snoozeLabel(popup)}
            variant="secondary"
            size="compact"
            onPress={onSnooze}
            testID="popup-snooze"
          />
          <Button label={t('common.close')} size="compact" onPress={onClose} testID="popup-close" />
        </View>
      </View>
    </View>
  );
}

/** 스누즈 맵이 로드되기 전에는 팝업 요청도 하지 않는다 — 숨긴 팝업이 잠깐 번쩍이는 것을 막는다. */
function useSnoozeState(): [SnoozeMap | null, (next: SnoozeMap) => void] {
  const [snoozes, setSnoozes] = useState<SnoozeMap | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPopupSnoozes().then((loaded) => {
      if (alive) setSnoozes(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);
  return [snoozes, setSnoozes];
}

export function PopupHost({ divisions = HOME_DIVISIONS }: { divisions?: readonly string[] } = {}) {
  const { width } = useFrameDimensions();
  const [snoozes, setSnoozes] = useSnoozeState();
  const [dismissed, setDismissed] = useState<readonly number[]>([]);
  const popups = usePopupsQuery(snoozes !== null);

  const dismiss = useCallback((nwId: number) => setDismissed((prev) => [...prev, nwId]), []);
  const snooze = useCallback(
    (popup: PopupDto) => {
      void snoozePopup(popup.nw_id, popup.nw_disable_hours).then(setSnoozes);
      dismiss(popup.nw_id);
    },
    [dismiss, setSnoozes],
  );

  const current =
    snoozes === null
      ? undefined
      : visiblePopups(popups.data ?? [], snoozes, divisions).find((popup) => !dismissed.includes(popup.nw_id));

  if (!current) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(current.nw_id)}>
      <PopupCard
        popup={current}
        width={width - CARD_INSET * 2}
        onClose={() => dismiss(current.nw_id)}
        onSnooze={() => snooze(current)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000080',
    padding: SPACE[4],
  },
  card: { width: '100%', maxHeight: '80%', borderRadius: RADII.md, padding: SPACE[4], gap: SPACE[3] },
  body: { flexGrow: 0 },
  bodyContent: { gap: SPACE[2] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE[2] },
});
