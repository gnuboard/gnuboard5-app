/**
 * 글 상세 훅 (PLAN T-P1B-05). 상세 쿼리 + 보드 상세(권한 힌트) + 읽기 오류 4분기 + 추천(403 '읽은 후에만' 이면 상세를
 * 다시 읽어 ss_view_* 를 만들고 한 번 재시도) + 삭제 + 이전/다음(replace). 화면은 이 훅의 결과만 그린다.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { useBoardQuery } from '../../../entities/board/queries';
import { postBodyMode, type PostBodyMode } from '../../../shared/html/wrOption';
import { useDeletePostMutation, usePostQuery, useVotePostMutation } from '../../../entities/post/queries';
import { useToggleScrapMutation } from '../../../entities/scrap/queries';
import type { PostDetailDto } from '../../../entities/post/schema';
import { useAuth } from '../../../entities/session/AuthContext';
import type { RootStackParamList } from '../../../navigation/types';
import { isApiError } from '../../../shared/api/client';
import { viewerFromMember } from '../boards/useBoardEntry';
import { useBlockedAuthorFilter, type AuthorRef } from './usePostList';
import { canManagePost, canVote, classifyPostReadError, type PostReadNotice } from './postAccess';

type PostDetailNavigation = NativeStackNavigationProp<RootStackParamList>;
export type VoteFlag = 'good' | 'nogood';
export type VoteOutcome = 'voted' | 'already' | 'login' | 'error';
export type ScrapOutcome = 'scrapped' | 'unscrapped' | 'login' | 'error';

const READ_FIRST = /only after reading/i;

export interface PostDetailState {
  post: PostDetailDto | undefined;
  isPending: boolean;
  error: unknown;
  notice: PostReadNotice | null;
  /** html1 → HTML, html2 → HTML + 줄바꿈 <br>, 그 외 → 평문(에디터 게시판의 옛 HTML 글은 HTML) — wrOption.postBodyMode. */
  bodyMode: PostBodyMode;
  memberId: string | undefined;
  canManage: boolean;
  votes: { good: boolean; nogood: boolean };
  vote: (flag: VoteFlag) => Promise<VoteOutcome>;
  voting: boolean;
  /** 서버 `is_scrapped`(회원만 의미 있음). */
  scrapped: boolean;
  toggleScrap: () => Promise<ScrapOutcome>;
  scrapping: boolean;
  remove: () => Promise<void>;
  removing: boolean;
  openNeighbor: (wrId: number) => void;
  refetch: () => void;
  /** 차단한 작성자가 아니면 true — 댓글 목록도 같은 기준으로 거른다(게스트 로컬 목록; 회원은 서버가 거른다). */
  isVisibleAuthor: (author: AuthorRef) => boolean;
}

export interface UsePostDetailInput {
  boTable: string;
  wrId: number;
  secretHint?: boolean;
  /** SC-12: 댓글 앞 N건만(나머지는 useMoreComments). 없으면 전량 — 알림 앵커 진입. */
  commentsLimit?: number;
}

/** 추천 실패를 결과로 — 409 는 '이미 참여', 그 외는 오류. */
function voteFailure(error: unknown): VoteOutcome {
  return isApiError(error) && error.status === 409 ? 'already' : 'error';
}

function needsReadSession(error: unknown): boolean {
  return isApiError(error) && error.status === 403 && READ_FIRST.test(error.message);
}

function useVote(memberId: string | undefined, boTable: string, wrId: number, refetch: () => Promise<unknown>) {
  const mutation = useVotePostMutation(boTable, wrId);
  const [voting, setVoting] = useState(false);
  const vote = useCallback(
    async (flag: VoteFlag): Promise<VoteOutcome> => {
      if (!memberId) return 'login';
      setVoting(true);
      try {
        await mutation.mutateAsync(flag);
        return 'voted';
      } catch (error: unknown) {
        // '읽은 후에만 추천' 403 — ss_view_* 세션이 없다. 상세를 다시 읽고(credentials include) 한 번 더.
        if (!needsReadSession(error)) return voteFailure(error);
        await refetch();
        return mutation.mutateAsync(flag).then(() => 'voted' as const, voteFailure);
      } finally {
        setVoting(false);
      }
    },
    [memberId, mutation, refetch],
  );
  return { vote, voting };
}

/** 스크랩 토글 — 게스트는 로그인, 실패는 error. "이미 스크랩" 200 도 scrapped 로 맞춘다. */
function useScrapToggle(memberId: string | undefined, boTable: string, wrId: number, scrapped: boolean) {
  const mutation = useToggleScrapMutation(boTable, wrId);
  const toggleScrap = useCallback(async (): Promise<ScrapOutcome> => {
    if (!memberId) return 'login';
    try {
      const result = await mutation.mutateAsync(!scrapped);
      return result.scrapped ? 'scrapped' : 'unscrapped';
    } catch {
      return 'error';
    }
  }, [memberId, mutation, scrapped]);
  return { toggleScrap, scrapping: mutation.isPending };
}

export function usePostDetail({ boTable, wrId, secretHint, commentsLimit }: UsePostDetailInput): PostDetailState {
  const navigation = useNavigation<PostDetailNavigation>();
  const member = useAuth().state.member;
  const memberId = member?.mb_id;
  const board = useBoardQuery(boTable, { fresh: true });
  const query = usePostQuery(boTable, wrId, true, commentsLimit);
  const deleteMutation = useDeletePostMutation(boTable, wrId);
  const isVisible = useBlockedAuthorFilter();
  const { vote, voting } = useVote(memberId, boTable, wrId, query.refetch);
  const post = query.data;
  const scrapped = post?.is_scrapped === true;
  const { toggleScrap, scrapping } = useScrapToggle(memberId, boTable, wrId, scrapped);

  const notice = useMemo(() => {
    if (!query.error) return null;
    const ctx = { viewer: viewerFromMember(member), board: board.data, secretHint, blockedAuthorHint: false };
    return classifyPostReadError(query.error, ctx);
  }, [query.error, member, board.data, secretHint]);
  // 차단한 작성자의 글은 서버가 회원에게 404 를 주고 게스트에게는 로컬 목록으로 앱이 가린다(ARCH §8.6).
  const blockedAuthor = post ? !isVisible(post) : false;

  const openNeighbor = useCallback(
    (nextWrId: number) => navigation.replace('PostDetail', { board: boTable, wr_id: nextWrId }),
    [navigation, boTable],
  );

  return {
    post: blockedAuthor ? undefined : post,
    isPending: query.isPending,
    error: query.error,
    notice: blockedAuthor ? { kind: 'blocked_author' } : notice,
    bodyMode: post ? postBodyMode(post.wr_option, post.wr_content, board.data?.bo_use_dhtml_editor === 1) : 'plain',
    memberId,
    canManage: post ? canManagePost(post, memberId) : false,
    votes: post ? canVote(post, memberId) : { good: false, nogood: false },
    vote,
    voting,
    scrapped,
    toggleScrap,
    scrapping,
    remove: async () => {
      await deleteMutation.mutateAsync();
    },
    removing: deleteMutation.isPending,
    openNeighbor,
    refetch: () => void query.refetch(),
    isVisibleAuthor: isVisible,
  };
}
