/**
 * 1:1 문의 첨부 슬롯 (T-P1B-11). 슬롯 2개 고정 — 기존 파일은 이름만, 새 파일은 갤러리에서 고른 이미지. 비운 기존 슬롯은
 * 저장 시 `bf_file_del[n]`. 민감 정보 첨부 주의 문구(PRD CM-F12)를 항상 보여준다.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { QA_MAX_FILES, type QaFileSlot } from '../../../entities/qa/api';
import { t } from '../../../shared/i18n';
import { pickSingleImageFromLibrary } from '../../../shared/lib/imagePicker';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { SPACE } from '../../../shared/ui/tokens/primitive';
import { toNewAttachment, type PickedFile } from '../compose/AttachmentList';
import { QA_SLOTS, freeQaSlot, type QaForm, type QaSlotState } from './qaComposeModel';

export interface QaAttachmentPickerProps {
  form: QaForm;
  disabled: boolean;
  onChange: (update: (prev: QaForm) => QaForm) => void;
  /** 테스트 주입용. */
  pick?: () => Promise<PickedFile | null>;
}

type FilledSlot = Exclude<QaSlotState, null>;

interface SlotRowProps {
  slot: QaFileSlot;
  state: FilledSlot;
  disabled: boolean;
  onRemove: () => void;
}

const defaultPick = (): Promise<PickedFile | null> =>
  pickSingleImageFromLibrary({ mediaTypes: ['images'], quality: 1, allowsEditing: false });

function slotLabel(state: FilledSlot): string {
  return state.kind === 'new' ? state.file.name : state.name;
}

function setSlot(slot: QaFileSlot, state: QaSlotState): (prev: QaForm) => QaForm {
  return (prev) => ({ ...prev, slots: { ...prev.slots, [slot]: state } });
}

/** 빈 슬롯이 없으면 그대로 둔다(버튼은 이미 비활성). */
function addPicked(picked: PickedFile): (prev: QaForm) => QaForm {
  const file = toNewAttachment(picked);
  return (prev) => {
    const slot = freeQaSlot(prev);
    if (slot === null) return prev;
    return setSlot(slot, { kind: 'new', file: { uri: file.uri, name: file.name, mimeType: file.mimeType } })(prev);
  };
}

function SlotRow({ slot, state, disabled, onRemove }: SlotRowProps) {
  const { colors } = useTheme();
  const label = slotLabel(state);
  return (
    <View style={[styles.row, { borderColor: colors.outlineSubtle }]} testID={`qa-slot-${slot}`}>
      <AppText variant="bodySm" numberOfLines={1} style={styles.name}>
        {label}
      </AppText>
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('board.remove_attachment', { name: label })}
        hitSlop={8}
        testID={`qa-slot-remove-${slot}`}
      >
        <AppText variant="label" tone="error">
          ✕
        </AppText>
      </Pressable>
    </View>
  );
}

export function QaAttachmentPicker({ form, disabled, onChange, pick = defaultPick }: QaAttachmentPickerProps) {
  const filled = QA_SLOTS.filter((slot) => form.slots[slot] !== null);
  const add = async () => {
    const picked = await pick();
    if (picked) onChange(addPicked(picked));
  };
  return (
    <View style={styles.root} testID="qa-attachments-picker">
      <AppText variant="labelSm" tone="onSurfaceSecondary">
        {`${t('qa.attachments')} (${filled.length}/${QA_MAX_FILES})`}
      </AppText>
      {filled.map((slot) => (
        <SlotRow
          key={slot}
          slot={slot}
          state={form.slots[slot] as FilledSlot}
          disabled={disabled}
          onRemove={() => onChange(setSlot(slot, null))}
        />
      ))}
      <Button
        label={t('qa.attach_add')}
        variant="secondary"
        size="compact"
        disabled={disabled || filled.length >= QA_MAX_FILES}
        onPress={() => void add()}
        testID="qa-attach-add"
      />
      <AppText variant="caption" tone="onSurfaceCaption" testID="qa-attach-caution">
        {t('qa.attach_caution')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACE[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE[2],
    paddingVertical: SPACE[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1 },
});
