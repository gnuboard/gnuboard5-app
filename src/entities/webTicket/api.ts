/**
 * 레거시 웹 페이지 1회용 입장권 (PLAN T-P2-09) — `POST /auth/web-ticket {to}`. 회원은 Bearer, 비회원은 주문조회 uid 를
 * 쿼리로(ARCH §7.9 — 본문·로그·내비게이션 파라미터에 싣지 않는다). 받은 입장권은 60초·1회용이고 화면 메모리에만 둔다.
 * 응답 url 은 API 와 같은 사이트의 입장 경로(`/plugin/webapp/bridge/enter.php`)여야 한다 — 다른 호스트면 거부.
 */
import { z } from 'zod';
import { API_BASE, ApiError, request } from '../../shared/api/client';
import { stringValue } from '../../shared/api/schemaPrimitives';

const TICKET = /^[0-9a-f]{64}$/;
const UID = /^[0-9a-f]{64}$/i;
const ENTER_PATH = '/plugin/webapp/bridge/enter.php';

const webTicketSchema = z.looseObject({ url: stringValue, ticket: stringValue });

export interface WebTicket {
  url: string;
  ticket: string;
}

/** 현금영수증 발급 요청 페이지(레거시 taxsave) 경로 — 서버 목록과 같은 모양. */
export function cashReceiptTarget(odId: string): string {
  if (!/^[0-9]{10,20}$/.test(odId)) throw new ApiError('Invalid order id', 0);
  return `/shop/taxsave.php?od_id=${odId}`;
}

function siteOrigin(): string {
  return new URL(API_BASE).origin;
}

/** 현금영수증 발급 중 이동할 수 있는 PG 호스트(하위 도메인 포함). 그 밖의 사이트로는 창이 이동하지 않는다. */
const PG_HOST_SUFFIXES = ['kcp.co.kr', 'inicis.com', 'tosspayments.com', 'nicepay.co.kr', 'uplus.co.kr', 'dacom.net'];

/** 입장 창에서 열어도 되는 주소 — 우리 사이트(API 와 같은 origin) 또는 알려진 PG 의 https. */
export function isAllowedLegacyWebUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.origin === siteOrigin()) return true;
  const host = url.hostname.toLowerCase();
  return url.protocol === 'https:' && PG_HOST_SUFFIXES.some((pg) => host === pg || host.endsWith(`.${pg}`));
}

export async function requestWebTicket(to: string, uid?: string): Promise<WebTicket> {
  const data = await request('/auth/web-ticket', {
    method: 'POST',
    query: uid && UID.test(uid) ? { uid } : {},
    body: { to },
    schema: webTicketSchema,
  });
  const url = new URL(data.url);
  if (url.origin !== siteOrigin() || url.pathname !== ENTER_PATH || !TICKET.test(data.ticket)) {
    throw new ApiError('Invalid web ticket response', 0);
  }
  return { url: `${url.origin}${url.pathname}`, ticket: data.ticket };
}
