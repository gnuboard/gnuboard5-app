/**
 * 컨텐츠 신고 API.
 *
 * 회원/비회원 모두 호출 가능 — 비회원은 device_id sig 검증된 X-Device-Id 로 식별.
 * UNIQUE 제약으로 같은 사용자/기기가 같은 컨텐츠 중복 신고 못 함.
 */
import { API_BASE, api, ApiError } from '../../shared/api/client';
import type { PaginationMeta } from '../../shared/api/client';
import { INPUT_LIMITS, clampText, normalizeMemberScopeId } from '../../shared/lib/textLimits';
import { editorImageFileUrl } from '../../shared/html/editorImages';
import { boTableSchema } from '../../shared/lib/routeParams';

const REPORT_REASON_MAX_LENGTH = 120;
const REPORT_DEVICE_ID_MAX_LENGTH = 128;
const REPORT_STATUS_TEXT_MAX_LENGTH = 64;
/** 서버 `reports.php` 가 기록하는 image target_key(file_url) 컬럼 길이. */
const REPORT_IMAGE_KEY_MAX_LENGTH = 128;

export type ReportTargetType = 'post' | 'comment' | 'image';

export interface ReportInput {
  target_type: ReportTargetType;
  /** post: '{bo_table}/{wr_id}', comment: '{bo_table}/{comment_id}', image: file_url */
  target_key: string;
  reason?: string;
  detail?: string;
}

export interface ReportResponse {
  report_id?: number;
  duplicate?: boolean;
  open_count?: number;
  auto_hidden?: boolean;
  message?: string;
}

export type ReportStatus = 'open' | 'closed' | 'dismissed';

export interface ReportItem {
  report_id: number;
  target_type: ReportTargetType;
  target_key: string;
  reporter_mb?: string | null;
  reporter_dev?: string | null;
  reason: string;
  detail?: string | null;
  status: ReportStatus;
  created_at: string;
  closed_by?: string | null;
  closed_at?: string | null;
  target_available?: boolean;
  target_parent_id?: number | null;
  target_subject?: string | null;
  target_excerpt?: string | null;
  target_author_id?: string | null;
  target_author_name?: string | null;
  target_author_nick?: string | null;
  target_author_banned?: boolean;
  target_hidden?: boolean;
  /** 이미지 신고의 사진 주소(이 사이트 것만). 새 키면 위 target_* 는 원래 글의 요약이다. */
  target_image_url?: string | null;
}

export interface ReportListResult {
  items: ReportItem[];
  meta?: PaginationMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function stringValue(value: unknown, fallback = '', maxLength?: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return maxLength === undefined ? trimmed : clampText(trimmed, maxLength);
}

function optionalNullableString(value: unknown, maxLength?: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const bounded = maxLength === undefined ? trimmed : clampText(trimmed, maxLength);
  return bounded || undefined;
}

function dateString(value: unknown): string | null {
  const text = optionalNullableString(value, REPORT_STATUS_TEXT_MAX_LENGTH);
  if (!text) return null;
  const date = new Date(text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? text : null;
}

function optionalNullableDateString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return dateString(value) ?? undefined;
}

function optionalNullableMemberId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return normalizeMemberScopeId(typeof value === 'string' ? value : null) ?? undefined;
}

function cleanReportTargetKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return clampText(trimmed, INPUT_LIMITS.url) || null;
}

function reportTargetKey(value: unknown, targetType: ReportTargetType): string | null {
  const cleaned = cleanReportTargetKey(value);
  if (!cleaned) return null;

  if (targetType === 'post' || targetType === 'comment') {
    // 보드는 런타임 문자열(PRD CM-F01) — 형식만 검사한다.
    const match = /^([A-Za-z0-9_]+)\/(\d+)$/.exec(cleaned);
    if (!match || !boTableSchema.safeParse(match[1]).success) return null;
    const id = positiveInt(match[2]);
    return id ? `${match[1]}/${id}` : null;
  }

  const scoped = SCOPED_IMAGE_KEY_RE.exec(cleaned);
  if (scoped) {
    const id = positiveInt(scoped[2]);
    if (!id || !boTableSchema.safeParse(scoped[1]).success) return null;
    return scopedImageKey(scoped[1], id, editorImageFileUrl(`${siteOrigin()}${scoped[3]}`));
  }
  // 옛 키(2026-10-06 이전 앱) — 이미지 주소만.
  const imageUrl = editorImageFileUrl(cleaned);
  return imageUrl && imageUrl.length <= REPORT_IMAGE_KEY_MAX_LENGTH ? imageUrl : null;
}

/** 이미지 신고 키 "게시판/글번호|이미지 경로" — 서버 reports.php api_report_image_parts 와 같은 모양. */
const SCOPED_IMAGE_KEY_RE = /^([A-Za-z0-9_]+)\/(\d+)\|(\/[A-Za-z0-9._~%/+=-]+)$/;

function siteOrigin(): string {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return '';
  }
}

function scopedImageKey(boTable: string, wrId: number, imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const key = `${boTable}/${wrId}|${new URL(imageUrl).pathname}`;
  return SCOPED_IMAGE_KEY_RE.test(key) && key.length <= REPORT_IMAGE_KEY_MAX_LENGTH ? key : null;
}

/**
 * 글 사진 신고 키 — 어느 글의 사진인지 같이 남겨, 관리자가 신고 관리에서 사진과 원래 글을 본다. 신고할 수 없는 사진
 * (에디터로 올린 사진이 아님)은 null. 키가 너무 길면 예전처럼 사진 주소만 보낸다.
 */
export function imageReportKey(boTable: string, wrId: number, imageUrl: string): string | null {
  const url = editorImageFileUrl(imageUrl);
  if (!url || !boTableSchema.safeParse(boTable).success || !positiveInt(wrId)) return null;
  return scopedImageKey(boTable, wrId, url) ?? (url.length <= REPORT_IMAGE_KEY_MAX_LENGTH ? url : null);
}

/** 관리자 신고 목록의 사진 주소 — 이 사이트(API 와 같은 출처)의 https·http 주소만 띄운다. */
function sameSiteImageUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.origin === siteOrigin() ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isReportTargetType(value: unknown): value is ReportTargetType {
  return value === 'post' || value === 'comment' || value === 'image';
}

function isReportStatus(value: unknown): value is ReportStatus {
  return value === 'open' || value === 'closed' || value === 'dismissed';
}

function optionalReportStatus(value: unknown, fallback: ReportStatus): ReportStatus {
  return isReportStatus(value) ? value : fallback;
}

function requireReportId(value: unknown): number {
  const id = positiveInt(value);
  if (!id) throw new ApiError('Invalid report id', 0);
  return id;
}

function requireReportTargetType(value: unknown): ReportTargetType {
  if (!isReportTargetType(value)) throw new ApiError('Invalid report target type', 0);
  return value;
}

function requireReportStatus(value: unknown): ReportStatus {
  if (!isReportStatus(value)) throw new ApiError('Invalid report status', 0);
  return value;
}

function normalizeReportItem(value: unknown): ReportItem | null {
  if (!isRecord(value)) return null;
  const reportId = positiveInt(value.report_id);
  if (!reportId || !isReportTargetType(value.target_type) || !isReportStatus(value.status)) return null;
  const createdAt = dateString(value.created_at);
  const targetKey = reportTargetKey(value.target_key, value.target_type);
  if (!createdAt || !targetKey) return null;

  const item: ReportItem = {
    report_id: reportId,
    target_type: value.target_type,
    target_key: targetKey,
    reason: stringValue(value.reason, '', REPORT_REASON_MAX_LENGTH),
    status: value.status,
    created_at: createdAt,
  };
  const reporterMb = optionalNullableMemberId(value.reporter_mb);
  if (reporterMb !== undefined) item.reporter_mb = reporterMb;
  const reporterDev = optionalNullableString(value.reporter_dev, REPORT_DEVICE_ID_MAX_LENGTH);
  if (reporterDev !== undefined) item.reporter_dev = reporterDev;
  const detail = optionalNullableString(value.detail, INPUT_LIMITS.notificationBody);
  if (detail !== undefined) item.detail = detail;
  const closedBy = optionalNullableMemberId(value.closed_by);
  if (closedBy !== undefined) item.closed_by = closedBy;
  const closedAt = optionalNullableDateString(value.closed_at);
  if (closedAt !== undefined) item.closed_at = closedAt;
  const targetSubject = optionalNullableString(value.target_subject, INPUT_LIMITS.postSubject);
  if (targetSubject !== undefined) item.target_subject = targetSubject;
  const targetExcerpt = optionalNullableString(value.target_excerpt, INPUT_LIMITS.notificationBody);
  if (targetExcerpt !== undefined) item.target_excerpt = targetExcerpt;
  const targetAuthorId = optionalNullableMemberId(value.target_author_id);
  if (targetAuthorId !== undefined) item.target_author_id = targetAuthorId;
  const targetAuthorName = optionalNullableString(value.target_author_name, INPUT_LIMITS.memberName);
  if (targetAuthorName !== undefined) item.target_author_name = targetAuthorName;
  const targetAuthorNick = optionalNullableString(value.target_author_nick, INPUT_LIMITS.memberName);
  if (targetAuthorNick !== undefined) item.target_author_nick = targetAuthorNick;
  const targetAvailable = optionalBoolean(value.target_available);
  if (targetAvailable !== undefined) item.target_available = targetAvailable;
  const targetHidden = optionalBoolean(value.target_hidden);
  if (targetHidden !== undefined) item.target_hidden = targetHidden;
  const targetAuthorBanned = optionalBoolean(value.target_author_banned);
  if (targetAuthorBanned !== undefined) item.target_author_banned = targetAuthorBanned;
  const targetImageUrl = sameSiteImageUrl(value.target_image_url);
  if (targetImageUrl !== undefined) item.target_image_url = targetImageUrl;
  const targetParentId = positiveInt(value.target_parent_id);
  if (targetParentId) item.target_parent_id = targetParentId;
  else if (value.target_parent_id === null) item.target_parent_id = null;
  return item;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }
  return undefined;
}

function normalizeReportResponse(value: unknown): ReportResponse {
  if (!isRecord(value)) return {};
  const response: ReportResponse = {};
  const reportId = positiveInt(value.report_id);
  const openCount = nonNegativeInt(value.open_count);
  const duplicate = optionalBoolean(value.duplicate);
  const autoHidden = optionalBoolean(value.auto_hidden);
  if (reportId) response.report_id = reportId;
  if (duplicate !== undefined) response.duplicate = duplicate;
  if (openCount !== undefined) response.open_count = openCount;
  if (autoHidden !== undefined) response.auto_hidden = autoHidden;
  if (typeof value.message === 'string' && value.message.trim()) {
    response.message = clampText(value.message.trim(), INPUT_LIMITS.notificationBody);
  }
  return response;
}

function normalizeReportInput(input: ReportInput): ReportInput {
  const targetType = requireReportTargetType(input.target_type);
  const targetKey = reportTargetKey(input.target_key, targetType);
  if (!targetKey) throw new ApiError('Invalid report target key', 0);
  const normalized: ReportInput = {
    target_type: targetType,
    target_key: targetKey,
  };
  const reason = typeof input.reason === 'string' ? clampText(input.reason.trim(), REPORT_REASON_MAX_LENGTH) : '';
  if (reason) normalized.reason = reason;
  const detail = typeof input.detail === 'string' ? clampText(input.detail.trim(), INPUT_LIMITS.notificationBody) : '';
  if (detail) normalized.detail = detail;
  return normalized;
}

function normalizeReportStatusResponse(
  value: unknown,
  fallbackReportId: number,
  fallbackStatus: ReportStatus,
): { report_id: number; status: ReportStatus } {
  if (!isRecord(value)) return { report_id: fallbackReportId, status: fallbackStatus };
  return {
    report_id: positiveInt(value.report_id) ?? fallbackReportId,
    status: isReportStatus(value.status) ? value.status : fallbackStatus,
  };
}

export async function submitReport(input: ReportInput): Promise<ReportResponse> {
  return normalizeReportResponse(await api.post<unknown>('/reports', normalizeReportInput(input)));
}

export async function listReports(
  params: {
    status?: ReportStatus;
    page?: number;
    per_page?: number;
  } = {},
): Promise<ReportListResult> {
  const env = await api.getEnvelope<ReportItem[]>('/reports', {
    status: optionalReportStatus(params.status, 'open'),
    page: positiveInt(params.page) ?? undefined,
    per_page: positiveInt(params.per_page) ?? undefined,
  });
  const items = Array.isArray(env.data)
    ? env.data.map(normalizeReportItem).filter((item): item is ReportItem => item !== null)
    : [];
  return { items, meta: env.meta };
}

export async function updateReportStatus(
  reportId: number,
  status: ReportStatus,
): Promise<{ report_id: number; status: ReportStatus }> {
  const normalizedReportId = requireReportId(reportId);
  const normalizedStatus = requireReportStatus(status);
  return normalizeReportStatusResponse(
    await api.patch<unknown>(`/reports/${normalizedReportId}`, { status: normalizedStatus }),
    normalizedReportId,
    normalizedStatus,
  );
}
