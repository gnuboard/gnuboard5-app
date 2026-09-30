/**
 * 게시판 진입 훅 (T-P1B-02). 탭 → `GET /boards/{bo}`(boardKeys.detail, 1h 캐시) → boardAccess 판정 → 안내 또는 PostList.
 * 보드 조회 자체가 실패하면(404·네트워크) 안내 없이 PostList 로 보내 목록 화면의 오류 상태가 처리하게 한다.
 */
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { getBoard } from '../../../entities/board/api';
import { BOARD_STALE_TIME_MS, boardKeys } from '../../../entities/board/queries';
import { useAuth, type AuthMember } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { appLog } from '../../../shared/lib/debug/appLog';
import { isBlockingNotice, resolveBoardEntry, type BoardEntryNotice, type BoardViewer } from './boardAccess';

export function viewerFromMember(member: AuthMember | null): BoardViewer | null {
  if (!member) return null;
  return { mb_level: member.mb_level ?? 1, mb_point: member.mb_point ?? 0, isAdmin: member.is_super_admin === true };
}

export function describeEntryNotice(notice: BoardEntryNotice): { title: string; message: string } {
  switch (notice.kind) {
    case 'login':
      return { title: t('boards.notice_login_title'), message: t('boards.notice_login') };
    case 'level':
      return {
        title: t(notice.gate === 'read' ? 'boards.notice_read_level_title' : 'boards.notice_level_title'),
        message: t('boards.notice_level', { required: notice.required, have: notice.have }),
      };
    case 'cert':
      return {
        title: t('boards.notice_cert_title'),
        message: t(notice.mode === 'adult' ? 'boards.notice_adult' : 'boards.notice_cert'),
      };
    case 'points':
      return {
        title: t('boards.notice_points_title'),
        message: t('boards.notice_points', { required: notice.required, have: notice.have }),
      };
    case 'group':
      return { title: t('boards.notice_group_title'), message: t('boards.notice_group') };
  }
}

/** 막는 안내는 확인만, 포인트 안내는 '계속' 로 진입. `alert` 는 테스트 주입용. */
export function presentEntryNotice(
  notice: BoardEntryNotice,
  proceed: () => void,
  alert: typeof Alert.alert = Alert.alert,
): void {
  const copy = describeEntryNotice(notice);
  if (isBlockingNotice(notice)) {
    alert(copy.title, copy.message, [{ text: t('common.confirm') }]);
    return;
  }
  alert(copy.title, copy.message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('boards.continue'), onPress: proceed },
  ]);
}

export function useBoardEntry(navigation: NativeStackNavigationProp<RootStackParamList>): (boTable: string) => void {
  const qc = useQueryClient();
  const member = useAuth().state.member;
  // 더블 탭 방지 — 판정 중인 보드는 무시(같은 상세 요청은 react-query 가 합치지만 then 은 각각 실행된다).
  const pending = useRef<string | null>(null);
  return useCallback(
    (boTable: string) => {
      if (pending.current === boTable) return;
      pending.current = boTable;
      const proceed = () => navigation.navigate('PostList', { board: boTable });
      void qc
        .fetchQuery({
          queryKey: boardKeys.detail(boTable),
          queryFn: () => getBoard(boTable),
          staleTime: BOARD_STALE_TIME_MS,
        })
        .then((board) => {
          const notice = resolveBoardEntry(board, viewerFromMember(member));
          if (notice) presentEntryNotice(notice, proceed);
          else proceed();
        })
        .catch((error: unknown) => {
          appLog.warn('BoardsScreen', 'board detail failed, entering anyway', { boTable, error });
          proceed();
        })
        .finally(() => {
          pending.current = null;
        });
    },
    [qc, member, navigation],
  );
}
