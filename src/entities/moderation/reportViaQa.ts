/**
 * UGC 신고 → 1:1 문의 (PLAN T-P2-02/05, §11 #3 — SC-10 보류의 클라이언트 측 완화). 리뷰·상품문의·쪽지·투표의견은 서버에
 * 신고 대상이 없으므로 기존 `POST /qas` 로 운영자에게 보낸다. 본문에 대상 종류와 식별자를 자동 기입한다.
 * 카테고리: 관리자 설정 목록에 '신고'가 있으면 그것, 목록이 비었으면 없음, 없으면 첫 카테고리 + 제목 "[신고]"
 * (서버는 목록 밖 카테고리를 422 로 거절한다 — 운영 체크리스트: 관리자 1:1 문의 분류에 '신고' 추가).
 * 1:1 문의는 회원 전용이므로 호출자가 로그인 여부를 먼저 확인한다.
 */
import { createQa, getQaConfig } from '../qa/api';

export const REPORT_CATEGORY = '신고';

export type ReportTarget =
  | { kind: 'review'; isId: string; itId: string }
  | { kind: 'product_qa'; iqId: string; itId: string }
  | { kind: 'memo'; meId: string }
  | { kind: 'poll_opinion'; poId: number; pcId: number };

export function reportIdentifier(target: ReportTarget): string {
  switch (target.kind) {
    case 'review':
      return `is_id=${target.isId} it_id=${target.itId}`;
    case 'product_qa':
      return `iq_id=${target.iqId} it_id=${target.itId}`;
    case 'memo':
      return `me_id=${target.meId}`;
    case 'poll_opinion':
      return `po_id=${target.poId} pc_id=${target.pcId}`;
  }
}

export function pickReportCategory(categories: readonly string[]): string | undefined {
  if (!categories.length) return undefined;
  return categories.includes(REPORT_CATEGORY) ? REPORT_CATEGORY : categories[0];
}

export function reportPayload(target: ReportTarget, reason: string, categories: readonly string[]) {
  const category = pickReportCategory(categories);
  const identifier = reportIdentifier(target);
  return {
    qa_subject: `[${REPORT_CATEGORY}] ${target.kind} ${identifier}`.slice(0, 255),
    qa_content: [`대상: ${target.kind}`, `식별자: ${identifier}`, `사유: ${reason.trim() || '-'}`].join('\n'),
    ...(category ? { qa_category: category } : {}),
  };
}

export async function reportViaQa(target: ReportTarget, reason: string): Promise<void> {
  const config = await getQaConfig();
  await createQa(reportPayload(target, reason, config.categories));
}
