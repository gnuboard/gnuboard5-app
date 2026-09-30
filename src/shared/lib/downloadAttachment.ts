/**
 * 비이미지 첨부 다운로드 (PLAN T-P1B-05, ARCH §8.7, PRD CM-F03).
 * `bf_download_url`(`/bbs/download.php?...&nonce=`)은 상세 GET(`credentials: include`)이 남긴 PHPSESSID(ss_view_*)
 * 세션이 있어야 통과한다. `expo-file-system` 은 OS 쿠키 저장소를 쓰지 않으므로 cookieStore 에서 읽어 `Cookie:` 헤더로
 * 손수 붙이고, 받은 파일은 `expo-sharing` 공유 시트로 연다(WebView download 모드는 두지 않는다 — WKWebView 가 다운로드를
 * 표시하지 않음).
 *
 * PLAN 은 features/attachments 를 가리키지만 feature 간 import 가 금지(lint 계층 규칙)라 shared/lib 에 둔다.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ApiError } from '../api/apiError';
import { cookieHeaderFor, originOf } from '../api/cookieStore';

/**
 * 그누보드 PHP 세션 쿠키 이름. 설치본마다 다르다 — 이 저장소의 개발 서버는 `PHPSESSID`, 일반 그누보드5 설치본
 * (운영 gnuboard.example.com 포함)은 `session_name('G5PHPSESSID')` 를 쓴다. 있는 쪽을 모두 넘긴다.
 */
export const SESSION_COOKIE_NAMES: readonly string[] = ['PHPSESSID', 'G5PHPSESSID'];
const CACHE_SUBDIR = 'attachments';
const SAFE_NAME = /[^\p{L}\p{N}._ -]+/gu;
const MAX_NAME_LENGTH = 120;

export interface DownloadAttachmentInput {
  url: string;
  /** 표시 파일명(bf_source) — 저장 파일명으로 정리해 쓴다. */
  fileName: string;
  mimeType?: string;
}

export interface DownloadDeps {
  /** 캐시 디렉터리의 fileName 으로 내려받는다(있으면 덮어씀). */
  download: (url: string, fileName: string, headers: Record<string, string>) => Promise<{ uri: string }>;
  share: (uri: string, mimeType?: string) => Promise<void>;
  cookieHeader: (origin: string) => Promise<string>;
}

/** 경로 구분자·제어문자를 제거한 저장 파일명. 비어 있으면 'attachment'. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(SAFE_NAME, '').replace(/^\.+/, '').trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || 'attachment';
}

/** 다운로드 URL 은 API/사이트 오리진만 — 본문 링크가 아니라 서버가 준 `bf_download_url` 이어야 한다. */
export function isAllowedDownloadUrl(url: string, allowedOrigins: readonly string[]): boolean {
  const origin = originOf(url);
  return origin !== '' && allowedOrigins.map((item) => item.toLowerCase()).includes(origin);
}

const defaultDeps: DownloadDeps = {
  async download(url, fileName, headers) {
    const directory = new Directory(Paths.cache, CACHE_SUBDIR);
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const file = await File.downloadFileAsync(url, new File(directory, fileName), { headers, idempotent: true });
    return { uri: file.uri };
  },
  async share(uri, mimeType) {
    if (!(await Sharing.isAvailableAsync())) throw new ApiError('Sharing unavailable', 0);
    await Sharing.shareAsync(uri, { mimeType });
  },
  cookieHeader: (origin) => cookieHeaderFor(origin, SESSION_COOKIE_NAMES),
};

/**
 * 받아서 공유 시트로 연다. 세션 쿠키가 없으면 서버가 nonce/세션 검사에서 거부하므로 요청 전에 실패시킨다
 * (상세를 다시 열어 ss_view_* 를 만들라는 안내는 호출자 몫).
 */
export async function downloadAttachment(
  input: DownloadAttachmentInput,
  allowedOrigins: readonly string[],
  deps: DownloadDeps = defaultDeps,
): Promise<{ uri: string }> {
  if (!isAllowedDownloadUrl(input.url, allowedOrigins)) throw new ApiError('Attachment host not allowed', 0);
  const cookie = await deps.cookieHeader(originOf(input.url));
  if (!cookie) throw new ApiError('Session cookie missing', 0, { code: 'SESSION' });
  const downloaded = await deps.download(input.url, safeFileName(input.fileName), { Cookie: cookie });
  await deps.share(downloaded.uri, input.mimeType);
  return downloaded;
}
