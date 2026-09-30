/**
 * 콘텐츠 페이지 API (PLAN T-P1B-10, PRD CM-10/CM-F11, API-MAP `/content/{co_id}`, `/content/seo/{slug}`). `co_content` 는
 * 서버가 `{{쇼핑몰명}}` 치환·처리한 HTML — 앱은 content 정책으로 sanitize 해 렌더한다.
 */
import { ApiError, request } from '../../shared/api/client';
import { coIdSchema } from '../../shared/lib/routeParams';
import { contentSchema, type ContentDto } from './schema';

const MAX_SLUG_LENGTH = 255;

export function requireCoId(value: unknown): string {
  const parsed = coIdSchema.safeParse(value);
  if (!parsed.success) throw new ApiError('Invalid content id', 0);
  return parsed.data;
}

function requireSlug(value: string): string {
  const slug = value.trim();
  if (!slug || slug.length > MAX_SLUG_LENGTH || slug.includes('/')) throw new ApiError('Invalid content slug', 0);
  return encodeURIComponent(slug);
}

export async function getContent(coId: string): Promise<ContentDto> {
  return request(`/content/${requireCoId(coId)}`, { schema: contentSchema });
}

export async function getContentBySeo(slug: string): Promise<ContentDto> {
  return request(`/content/seo/${requireSlug(slug)}`, { schema: contentSchema });
}
