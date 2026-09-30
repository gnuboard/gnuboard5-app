/**
 * 댓글 작성/수정 입력 (T-P1B-05). 답글 대상·수정 대상 배지, 비밀 토글, 게스트는 로그인 안내.
 * 배치는 Claude Design v2 댓글 입력 — 윗줄 ✕ + 회색 입력칸, 아랫줄 왼쪽 '비밀 댓글' 칩 · 오른쪽 등록 버튼.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { t } from '../../../shared/i18n';
import { INPUT_LIMITS } from '../../../shared/lib/textLimits';
import { AppText } from '../../../shared/ui/AppText';
import { Button } from '../../../shared/ui/Button';
import { Chip } from '../../../shared/ui/Chip';
import { useTheme } from '../../../shared/ui/theme/ThemeProvider';
import { RADII, SPACE } from '../../../shared/ui/tokens/primitive';
import { textStyle } from '../../../shared/ui/tokens/type';

export type ComposerMode =
  { kind: 'new' } | { kind: 'reply'; toName: string } | { kind: 'edit'; initial: string; secret: boolean };

export interface CommentComposerProps {
  mode: ComposerMode;
  isMember: boolean;
  /** 보드 `bo_use_secret` 0 이면 숨김. */
  allowSecret: boolean;
  submitting: boolean;
  onSubmit: (input: { content: string; secret: boolean }) => void;
  onCancelMode: () => void;
  onRequireLogin: () => void;
  /** 하단 작업 바의 '댓글'로 열었을 때 — 입력에 바로 포커스. */
  autoFocus?: boolean;
  /** 새 댓글 입력을 닫는다(글 상세 하단 바로 돌아감). 없으면 닫기 버튼을 그리지 않는다. */
  onDismiss?: () => void;
}

/** 모드가 바뀌면 입력을 새로 시작한다(키 리마운트) — 수정 대상 본문이 초기값으로 들어간다. */
function modeKey(mode: ComposerMode): string {
  if (mode.kind === 'reply') return `reply:${mode.toName}`;
  if (mode.kind === 'edit') return `edit:${mode.secret ? 1 : 0}:${mode.initial}`;
  return 'new';
}

export function CommentComposer(props: CommentComposerProps) {
  if (!props.isMember) {
    return (
      <Pressable onPress={props.onRequireLogin} accessibilityRole="button" style={styles.guest} testID="comment-guest">
        <AppText variant="bodySm" tone="link">
          {t('board.comment_placeholder_guest')}
        </AppText>
      </Pressable>
    );
  }
  return <ComposerForm key={modeKey(props.mode)} {...props} />;
}

function ModeChip({ mode, onCancel }: { mode: ComposerMode; onCancel: () => void }) {
  if (mode.kind === 'new') return null;
  const label = mode.kind === 'reply' ? t('board.reply_to', { name: mode.toName }) : t('board.comment_editing');
  return (
    <View style={styles.modeRow}>
      <Chip label={label} selected onPress={onCancel} testID="comment-mode-chip" />
    </View>
  );
}

function DismissButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.close')}
      hitSlop={8}
      style={styles.dismiss}
      testID="comment-dismiss"
    >
      <Ionicons name="close" size={22} color={colors.onSurfaceCaption} />
    </Pressable>
  );
}

interface ActionRowProps {
  showSecret: boolean;
  secret: boolean;
  onToggleSecret: () => void;
  submitLabel: string;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

/** 아랫줄 — 왼쪽 '비밀 댓글' 칩(쓸 수 있는 게시판만), 오른쪽 등록 버튼. */
function ActionRow(props: ActionRowProps) {
  return (
    <View style={styles.actionRow}>
      {props.showSecret ? (
        <Chip
          icon={props.secret ? 'lock-closed' : 'lock-closed-outline'}
          label={t('board.comment_secret_toggle')}
          selected={props.secret}
          onPress={props.onToggleSecret}
          testID="comment-secret-toggle"
        />
      ) : (
        <View />
      )}
      <Button
        label={props.submitLabel}
        loading={props.submitting}
        disabled={!props.canSubmit}
        onPress={props.onSubmit}
        testID="comment-submit"
      />
    </View>
  );
}

function ComposerForm(props: CommentComposerProps) {
  const { mode, allowSecret, submitting, onSubmit, onCancelMode, autoFocus, onDismiss } = props;
  const { colors } = useTheme();
  const [text, setText] = useState(mode.kind === 'edit' ? mode.initial : '');
  // 수정은 원래 비밀 여부를 이어받는다 — 그렇지 않으면 수정할 때마다 비밀 댓글이 공개된다.
  const [secret, setSecret] = useState(mode.kind === 'edit' ? mode.secret : false);
  const submit = () => {
    if (!text.trim()) return;
    onSubmit({ content: text.trim(), secret });
    if (mode.kind !== 'edit') setText('');
  };
  return (
    <View style={[styles.root, { borderTopColor: colors.outlineSubtle, backgroundColor: colors.surface }]}>
      <ModeChip mode={mode} onCancel={onCancelMode} />
      <View style={styles.inputRow}>
        {onDismiss && mode.kind === 'new' ? <DismissButton onPress={onDismiss} /> : null}
        <TextInput
          autoFocus={autoFocus}
          value={text}
          onChangeText={setText}
          placeholder={t('board.comment_placeholder')}
          placeholderTextColor={colors.onSurfaceCaption}
          multiline
          maxLength={INPUT_LIMITS.postComment}
          style={[
            styles.input,
            textStyle('bodyLg'),
            { color: colors.onSurface, backgroundColor: colors.surfaceContainer },
          ]}
          accessibilityLabel={t('board.comment_placeholder')}
          testID="comment-input"
        />
      </View>
      <ActionRow
        showSecret={allowSecret || (mode.kind === 'edit' && mode.secret)}
        secret={secret}
        onToggleSecret={() => setSecret((v) => !v)}
        submitLabel={mode.kind === 'edit' ? t('common.save') : t('board.comment_submit')}
        submitting={submitting}
        canSubmit={!!text.trim()}
        onSubmit={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: SPACE[3], gap: SPACE[2], borderTopWidth: StyleSheet.hairlineWidth },
  guest: { padding: SPACE[4], alignItems: 'center' },
  modeRow: { flexDirection: 'row' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE[2] },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dismiss: { minHeight: 48, justifyContent: 'center', paddingHorizontal: SPACE[1] },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: RADII.md,
    paddingHorizontal: SPACE[3],
    paddingVertical: SPACE[2],
  },
});
