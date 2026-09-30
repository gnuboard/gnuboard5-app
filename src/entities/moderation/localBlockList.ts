/**
 * 로컬 차단 목록 (PLAN T-P2-02/05, §11 #3 — SC-10 보류의 클라이언트 측 완화). 리뷰·상품문의·쪽지·투표의견 작성자를
 * 이 기기에서만 숨긴다(게시판 글/댓글 차단은 서버 기능 — 이것과 별개). 작성자 식별은 mb_id 우선, 없으면 표시명.
 * AsyncStorage 에 최대 200건. 저장 실패는 조용히 무시(차단은 편의 기능 — 신고가 정식 경로).
 * features 여러 곳(shop 리뷰·문의, community 투표)이 함께 쓰므로 entities 에 둔다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const LOCAL_BLOCKLIST_KEY = 'ugc.blocklist.v1';
export const LOCAL_BLOCKLIST_MAX = 200;

export interface BlockedAuthor {
  key: string;
  label: string;
}

export interface AuthorRef {
  mbId?: string | null;
  name?: string | null;
}

export function authorKey(author: AuthorRef): string | null {
  const mbId = author.mbId?.trim();
  if (mbId) return `mb:${mbId}`;
  const name = author.name?.trim();
  return name ? `name:${name}` : null;
}

function parse(raw: string | null): BlockedAuthor[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is BlockedAuthor =>
        typeof item === 'object' && item !== null && typeof item.key === 'string' && typeof item.label === 'string',
    );
  } catch {
    return [];
  }
}

export async function listBlockedAuthors(): Promise<BlockedAuthor[]> {
  try {
    return parse(await AsyncStorage.getItem(LOCAL_BLOCKLIST_KEY));
  } catch {
    return [];
  }
}

async function save(list: BlockedAuthor[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_BLOCKLIST_KEY, JSON.stringify(list.slice(0, LOCAL_BLOCKLIST_MAX)));
  } catch {
    /* 편의 기능 — 실패해도 흐름을 막지 않는다 */
  }
}

export async function blockAuthor(author: AuthorRef): Promise<void> {
  const key = authorKey(author);
  if (!key) return;
  const list = (await listBlockedAuthors()).filter((item) => item.key !== key);
  await save([{ key, label: author.name?.trim() || author.mbId?.trim() || key }, ...list]);
}

export async function unblockAuthor(key: string): Promise<void> {
  await save((await listBlockedAuthors()).filter((item) => item.key !== key));
}

/** mb_id 또는 표시명 중 하나라도 차단 목록에 있으면 숨긴다. */
export function isBlockedAuthor(list: readonly BlockedAuthor[], author: AuthorRef): boolean {
  if (!list.length) return false;
  const keys = new Set(list.map((item) => item.key));
  const mbId = author.mbId?.trim();
  const name = author.name?.trim();
  return (!!mbId && keys.has(`mb:${mbId}`)) || (!!name && keys.has(`name:${name}`));
}

export const blockListKey = ['local-blocklist'] as const;

export function useLocalBlockList() {
  return useQuery({ queryKey: blockListKey, queryFn: listBlockedAuthors, staleTime: Infinity });
}

export function useBlockAuthor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: blockAuthor,
    onSuccess: () => qc.invalidateQueries({ queryKey: blockListKey }),
  });
}
