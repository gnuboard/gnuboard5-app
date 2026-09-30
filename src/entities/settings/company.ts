/**
 * 사업자 신원정보 표시 행 (PLAN T-P1C-13, PRD SY-06/SY-F05, SC-18) — 전자상거래법 제10조 항목을 정해진 순서로.
 * `/settings.company` 가 없거나 상호가 비면 null(섹션 숨김 — 빈 값 노출 금지). 값은 trim, 빈 값 행은 뺀다.
 */
import { t } from '../../shared/i18n';
import type { CompanyInfo } from './schema';

export interface CompanyRow {
  key: keyof CompanyInfo & string;
  label: string;
  value: string;
}

/** 관리자 입력값이 비정상적으로 길어도 footer 레이아웃이 깨지지 않게 자른다(다른 설정 문자열과 같은 관례). */
export const COMPANY_FIELD_MAX = 200;

const ORDER: readonly (keyof CompanyInfo & string)[] = [
  'name',
  'ceo',
  'addr',
  'tel',
  'email',
  'biz_no',
  'mail_order_no',
  'privacy_officer',
];

export function companyRows(settings: { company?: CompanyInfo } | undefined): CompanyRow[] | null {
  const company = settings?.company;
  if (!company?.name?.trim()) return null;
  return ORDER.flatMap((key) => {
    const raw = company[key];
    const value = typeof raw === 'string' ? raw.trim().slice(0, COMPANY_FIELD_MAX) : '';
    return value ? [{ key, label: t(`company.${key}`), value }] : [];
  });
}
