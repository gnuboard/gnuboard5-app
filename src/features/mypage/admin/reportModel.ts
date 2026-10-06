/**
 * 신고 관리 표시 로직 (PLAN T-P1A-14) — 대상 글로 가는 경로, 대상 종류·사유 문구. 게시판 코드는 런타임 문자열이라
 * 형식(boTableSchema)만 검사한다(PRD CM-F01 — 사이트마다 게시판이 다르다).
 */
import type { ReportItem } from '../../../entities/report/api';
import type { BoardCode } from '../../../navigation/types';
import { t } from '../../../shared/i18n';
import { boTableSchema } from '../../../shared/lib/routeParams';

function parsePositiveSafeInt(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * 글·댓글 신고 → 글 화면 파라미터. 댓글은 부모 글(target_parent_id)을 연다. 이미지 신고는 키에 원래 글이 있으면
 * ("게시판/글번호|사진 경로") 그 글을, 옛 키(사진 주소만)면 null.
 */
export function parsePostTarget(report: ReportItem): { board: BoardCode; wr_id: number } | null {
  const pattern = report.target_type === 'image' ? /^([A-Za-z0-9_]+)\/(\d+)\|/ : /^([A-Za-z0-9_]+)\/(\d+)$/;
  const match = pattern.exec(report.target_key);
  if (!match) return null;
  const board: BoardCode = match[1];
  if (!boTableSchema.safeParse(board).success) return null;
  const wrId =
    report.target_type === 'comment' && report.target_parent_id
      ? report.target_parent_id
      : parsePositiveSafeInt(match[2]);
  return wrId ? { board, wr_id: wrId } : null;
}

export function targetLabel(report: Pick<ReportItem, 'target_type'>): string {
  if (report.target_type === 'post') return t('report.target_post');
  if (report.target_type === 'comment') return t('report.target_comment');
  return t('reports_admin.target_image');
}

const REASON_KEYS: Record<string, string> = {
  spam: 'report.reason_spam',
  abuse: 'report.reason_abuse',
  adult: 'report.reason_adult',
  illegal: 'report.reason_illegal',
  other: 'report.reason_other',
};

/** 알려진 사유는 번역 문구, 모르는 값은 서버 문자열 그대로(빈 값이면 "기타"). */
export function reasonLabel(reason: string): string {
  // 서버 값이 'constructor' 같은 이름이어도 Object.prototype 을 집지 않게 자기 키만 본다.
  if (Object.hasOwn(REASON_KEYS, reason)) return t(REASON_KEYS[reason]);
  return reason || t('report.reason_other');
}

export function authorLabel(report: ReportItem): string {
  return report.target_author_nick ?? report.target_author_name ?? report.target_author_id ?? '';
}
