/**
 * 리뷰 본문 조립 (PLAN T-P2-02 사진) — 텍스트는 HTML 로 이스케이프하고 줄바꿈을 `<br>`, 사진은 업로드 URL 을 `<img>` 로
 * 뒤에 붙인다(서버 `shop_api_clean_user_html` 이 다시 정리). 수정할 때는 기존 본문에서 http(s) 이미지 URL 을 꺼내 사진 목록으로
 * 되돌린다 — 텍스트 편집 칸에는 이미지가 빠진 글만 보인다.
 */
export const REVIEW_PHOTO_MAX = 5;

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildReviewHtml(text: string, photoUrls: readonly string[]): string {
  const body = escapeText(text.trim()).replace(/\r?\n/g, '<br>');
  const images = photoUrls
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, REVIEW_PHOTO_MAX)
    .map((url) => `<p><img src="${escapeAttr(url)}" alt=""></p>`)
    .join('');
  return images ? `<p>${body}</p>${images}` : body;
}

/** 본문의 http(s) `<img src>`(자체 업로드 URL — dev 는 http) — 순서 유지, 중복 제거, 최대 5장. */
export function extractReviewPhotos(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const url = match[1].replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= REVIEW_PHOTO_MAX) break;
  }
  return urls;
}
