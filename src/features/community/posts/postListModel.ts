/**
 * 글 목록 순수 규칙 (PLAN T-P1B-03, PRD CM-F02). 화면·훅은 여기 함수만 조합한다.
 *
 * - 페이지 병합: 공지는 1페이지에서만 채택하고 wr_id 로 dedupe(스크롤 중 새 글이 끼어들면 서버 페이지가 밀려 중복이 온다).
 * - 정렬 칩: 최신(서버 기본, sst 없음)·조회·추천·댓글 — 서버 `sst/sod` 로 변환.
 * - 차단 작성자: 회원은 서버가 걸러 주지만 게스트는 로컬 목록으로 앱이 거른다(ARCH §8.6). 한 페이지가 전부 걸러지면
 *   훅이 다음 페이지를 자동으로 당긴다(빈 화면 방지).
 * - maxPages 20: 그 이상은 검색으로 유도한다.
 */
import type { PostListResult } from '../../../entities/post/api';
import { splitNotices, type PostSortField, type SortDirection } from '../../../entities/post/model';
import type { PostDto } from '../../../entities/post/schema';

export type PostSortOption = 'latest' | 'hit' | 'good' | 'comment';
export const POST_SORT_OPTIONS: readonly PostSortOption[] = ['latest', 'hit', 'good', 'comment'];
export const MAX_PAGES = 20;

const SORT_PARAMS: Record<PostSortOption, { sort?: PostSortField; direction?: SortDirection }> = {
  latest: {},
  hit: { sort: 'wr_hit', direction: 'desc' },
  good: { sort: 'wr_good', direction: 'desc' },
  comment: { sort: 'wr_comment', direction: 'desc' },
};

export function sortParams(option: PostSortOption): { sort?: PostSortField; direction?: SortDirection } {
  return SORT_PARAMS[option];
}

export interface MergedPostList {
  notices: PostDto[];
  items: PostDto[];
  /** 서버가 준 전체 건수(1페이지 meta). */
  total: number | undefined;
}

export type AuthorFilter = (post: PostDto) => boolean;

/** 모든 페이지를 공지/일반으로 병합. `isVisible` 이 false 인 글(차단 작성자)은 제외. */
export function mergePostPages(pages: readonly PostListResult[], isVisible: AuthorFilter = () => true): MergedPostList {
  const seen = new Set<number>();
  const notices: PostDto[] = [];
  const items: PostDto[] = [];
  pages.forEach((page, index) => {
    const split = splitNotices(page.items, index + 1);
    for (const post of split.notices) {
      if (!seen.has(post.wr_id) && isVisible(post)) notices.push(post);
      seen.add(post.wr_id);
    }
    for (const post of split.items) {
      if (!seen.has(post.wr_id) && isVisible(post)) items.push(post);
      seen.add(post.wr_id);
    }
  });
  return { notices, items, total: pages[0]?.meta?.total };
}

/** 마지막 페이지가 전부 걸러졌고 다음 페이지가 있으면 자동으로 이어 받는다(전부 차단 시 빈 화면 방지). */
export function shouldAutoFetchNext(
  pages: readonly PostListResult[],
  isVisible: AuthorFilter,
  hasNextPage: boolean,
): boolean {
  if (!hasNextPage || pages.length === 0 || pages.length >= MAX_PAGES) return false;
  const last = pages[pages.length - 1];
  const regular = splitNotices(last.items, pages.length).items;
  return regular.length > 0 && regular.every((post) => !isVisible(post));
}

export function canLoadMore(pages: readonly PostListResult[], hasNextPage: boolean): boolean {
  return hasNextPage && pages.length < MAX_PAGES;
}

/** 목록 행 키 — 공지와 일반이 같은 wr_id 를 가질 수 없지만 섹션이 달라 접두사로 구분한다. */
export function postRowKey(post: PostDto, section: 'notice' | 'item'): string {
  return `${section}:${post.wr_id}`;
}
