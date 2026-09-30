/** 콘텐츠 페이지 쿼리 (T-P1B-10). 거의 안 바뀌는 정적 페이지라 1시간 stale. */
import { useQuery } from '@tanstack/react-query';
import { getContent, getContentBySeo } from './api';
import type { ContentDto } from './schema';

const CONTENT_STALE_MS = 60 * 60 * 1000;

export type ContentRef = { co_id: string } | { seo: string };

export const contentKeys = {
  all: ['content'] as const,
  detail: (ref: ContentRef) => ['content', 'co_id' in ref ? `id:${ref.co_id}` : `seo:${ref.seo}`] as const,
};

function fetchContent(ref: ContentRef): Promise<ContentDto> {
  return 'co_id' in ref ? getContent(ref.co_id) : getContentBySeo(ref.seo);
}

export function useContentQuery(ref: ContentRef | null) {
  return useQuery({
    queryKey: ref ? contentKeys.detail(ref) : ['content', 'none'],
    queryFn: () => fetchContent(ref as ContentRef),
    enabled: ref !== null,
    staleTime: CONTENT_STALE_MS,
  });
}
