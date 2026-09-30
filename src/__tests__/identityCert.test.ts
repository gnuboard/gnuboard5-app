/**
 * 앱 본인인증 (SC-21) — 관리자 설정 → 인증 수단, 시작 URL, 결과 페이지 메시지 해석.
 */
import { certMethods, certStartUrl, parseCertMessage } from '../features/auth/cert/identityCert';

const config = (simple: string, hp: string) => ({
  enabled: true,
  required: false,
  use_hp: false,
  require_hp: false,
  simple,
  hp,
});

describe('certMethods', () => {
  test('simple(inicis) and phone(kcp) follow the admin settings in that order', () => {
    expect(certMethods(config('inicis', 'kcp'))).toEqual([
      { method: 'simple', path: '/api/cert/inicis_start.php' },
      { method: 'hp', path: '/api/cert/kcp_start.php' },
    ]);
    expect(certMethods(config('', 'kcp_v2'))).toEqual([{ method: 'hp', path: '/api/cert/kcp_v2_start.php' }]);
  });

  test('unsupported providers (kcb) and a disabled config give no methods', () => {
    expect(certMethods(config('', 'kcb'))).toEqual([]);
    expect(certMethods({ ...config('inicis', 'kcp'), enabled: false })).toEqual([]);
    expect(certMethods(undefined)).toEqual([]);
  });
});

test('start url marks the app client and the page type', () => {
  expect(certStartUrl('https://shop.example', '/api/cert/inicis_start.php')).toBe(
    'https://shop.example/api/cert/inicis_start.php?pageType=register&client=app',
  );
});

describe('parseCertMessage', () => {
  const success = {
    type: 'identity-verification-result',
    status: 'success',
    cert_type: 'simple',
    mb_name: '홍길동',
    mb_hp: '010-1234-5678',
    cert_no: 'abc',
    mb_birth: '19900101',
    adult: 1,
    cert_token: 'h.p.s',
  };

  test('success needs the signed token and keeps the verified name and phone', () => {
    expect(parseCertMessage(JSON.stringify(success))).toEqual({
      kind: 'success',
      certType: 'simple',
      name: '홍길동',
      hp: '010-1234-5678',
      token: 'h.p.s',
    });
    expect(parseCertMessage(JSON.stringify({ ...success, cert_token: undefined }))).toEqual({
      kind: 'error',
      message: '',
    });
  });

  test('errors carry the server message; other messages are ignored', () => {
    expect(
      parseCertMessage(
        JSON.stringify({ type: 'identity-verification-result', status: 'error', message: '이미 가입된 내역' }),
      ),
    ).toEqual({ kind: 'error', message: '이미 가입된 내역' });
    expect(parseCertMessage(JSON.stringify({ type: 'other' }))).toBeNull();
    expect(parseCertMessage('not json')).toBeNull();
  });
});
