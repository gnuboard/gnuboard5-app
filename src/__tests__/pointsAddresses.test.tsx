/**
 * 포인트·배송지·우편번호 (PLAN T-P1C-10) — address-validation 이식, 우편번호 메시지(검증·참고항목·허용 호스트),
 * 폼 모델(검증·422 매핑·우편번호 반영), 배송지 화면(목록·기본 지정·삭제 확인·저장 본문), Postcode 화면(결과를
 * 폼으로 merge), 포인트 화면(잔액·내역·부호), 게스트 로그인 안내.
 */
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Address } from '../entities/address/api';
import {
  addressErrorsFromApi,
  applyPostcode,
  EMPTY_ADDRESS_FORM,
  formFromAddress,
  toAddressInput,
  validateAddressForm,
} from '../features/shop/addresses/addressForm';
import { AddressesScreen, addressLines } from '../features/shop/addresses/AddressesScreen';
import { AddressFormScreen } from '../features/shop/addresses/AddressFormScreen';
import { formatPoint, PointsScreen } from '../features/shop/points/PointsScreen';
import { isAllowedPostcodeUrl, parsePostcodeMessage, postcodeHtml } from '../features/webview/postcode';
import { PostcodeScreen } from '../features/webview/PostcodeScreen';
import { ApiError } from '../shared/api/client';
import {
  isValidKoreanPhone,
  isValidKoreanZip,
  joinZip,
  normalizeKoreanZipInput,
} from '../shared/lib/addressValidation';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';
import { http, HttpResponse, server } from '../test/msw/server';

const mockAuth: { member: { mb_id: string } | null; loading: boolean } = {
  member: { mb_id: 'm1' },
  loading: false,
};
jest.mock('../entities/session/AuthContext', () => ({
  useAuth: () => ({ state: { member: mockAuth.member, loading: mockAuth.loading } }),
}));
jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));
const mockToast = jest.fn();
jest.mock('../shared/ui/Toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
const mockWebViewProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: (props: Record<string, unknown>) => {
      mockWebViewProps.current = props;
      return <View testID={props.testID as string} />;
    },
  };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const envelope = (data: unknown) => HttpResponse.json({ success: true, data });
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function address(id: number, extra: Partial<Address> = {}): Address {
  return {
    ad_id: id,
    ad_subject: `집${id}`,
    ad_default: 0,
    ad_name: '홍길동',
    ad_tel: '',
    ad_hp: '010-1234-5678',
    ad_zip1: '063',
    ad_zip2: '07',
    ad_addr1: '서울 강남구 테헤란로 1',
    ad_addr2: '101호',
    ad_addr3: '(역삼동)',
    ad_jibeon: '',
    ...extra,
  } as Address;
}

function wrap(ui: React.ReactElement, qc: QueryClient) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={qc}>
        <ThemeProvider initialPreference="light">{ui}</ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function renderScreen(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(wrap(ui, qc));
  return qc;
}

const route = (name: string, params: unknown) => ({ key: name, name, params }) as never;

beforeAll(async () => {
  await setLocale('ko');
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  mockAuth.member = { mb_id: 'm1' };
  navigation.navigate.mockReset();
  navigation.goBack.mockReset();
  mockToast.mockReset();
});
afterEach(() => {
  server.resetHandlers();
  jest.restoreAllMocks();
});
afterAll(() => server.close());

describe('address validation (Next.js port)', () => {
  test('phones, zips and normalization', () => {
    expect(isValidKoreanPhone('010-1234-5678')).toBe(true);
    expect(isValidKoreanPhone('01012345678')).toBe(true);
    expect(isValidKoreanPhone('02-123-4567')).toBe(true);
    expect(isValidKoreanPhone('1234')).toBe(false);
    expect(isValidKoreanZip('06307')).toBe(true);
    expect(isValidKoreanZip('0630')).toBe(false);
    expect(normalizeKoreanZipInput('063-07x9')).toBe('06307');
    expect(joinZip('063', '07')).toBe('06307');
  });
});

describe('postcode bridge', () => {
  const pick = (data: Record<string, unknown>) => JSON.stringify({ type: 'postcode', data });
  test('road address with reference items', () => {
    const message = parsePostcodeMessage(
      pick({
        zonecode: '06236',
        userSelectedType: 'R',
        roadAddress: '서울 강남구 테헤란로 152',
        jibunAddress: '서울 강남구 역삼동 737',
        bname: '역삼동',
        buildingName: '강남파이낸스센터',
        apartment: 'Y',
      }),
    );
    expect(message).toEqual({
      kind: 'result',
      result: {
        zonecode: '06236',
        address: '서울 강남구 테헤란로 152',
        extra: '(역삼동, 강남파이낸스센터)',
        jibun: '서울 강남구 역삼동 737',
      },
    });
  });

  test('jibun selection, errors and junk', () => {
    expect(
      parsePostcodeMessage(
        pick({ zonecode: '06236', userSelectedType: 'J', jibunAddress: '역삼동 737', bname: '역삼동' }),
      ),
    ).toEqual({ kind: 'result', result: { zonecode: '06236', address: '역삼동 737', extra: '', jibun: '' } });
    expect(parsePostcodeMessage(JSON.stringify({ type: 'error' }))).toEqual({ kind: 'error' });
    expect(parsePostcodeMessage('not json')).toEqual({ kind: 'invalid' });
    expect(parsePostcodeMessage(pick({ zonecode: '123', roadAddress: 'x' }))).toEqual({ kind: 'invalid' });
    expect(parsePostcodeMessage(pick({ zonecode: '06236', userSelectedType: 'R', roadAddress: '' }))).toEqual({
      kind: 'invalid',
    });
  });

  test('navigation allowlist and page script', () => {
    expect(isAllowedPostcodeUrl('https://postcode.map.daum.net/search?x=1')).toBe(true);
    expect(isAllowedPostcodeUrl('about:blank')).toBe(true);
    expect(isAllowedPostcodeUrl('https://evil.example/')).toBe(false);
    expect(isAllowedPostcodeUrl('http://postcode.map.daum.net/')).toBe(false);
    expect(isAllowedPostcodeUrl('https://postcode.map.daum.net@evil.example/')).toBe(false);
    expect(isAllowedPostcodeUrl('data:text/html,<script>')).toBe(false);
    expect(postcodeHtml()).toContain('postcode.v2.js');
    expect(postcodeHtml()).toContain("object-src 'none'");
    expect(isAllowedPostcodeUrl('https://postcode.map.daum.net:9999/x')).toBe(false);
  });
});

describe('address form model', () => {
  test('validation, clipping, postcode and server errors', () => {
    const errors = validateAddressForm({ ...EMPTY_ADDRESS_FORM, tel: '12' });
    expect(Object.keys(errors).sort()).toEqual(['addr1', 'hp', 'name', 'tel', 'zip']);
    const filled = applyPostcode(
      { ...formFromAddress(address(1)), subject: 'x'.repeat(30) },
      { zonecode: '06236', address: '테헤란로 152', extra: '(역삼동)', jibun: '역삼동 737' },
    );
    expect(filled).toMatchObject({
      zip: '06236',
      addr1: '테헤란로 152',
      addr2: '',
      addr3: '(역삼동)',
      jibeon: '역삼동 737',
    });
    expect(validateAddressForm(filled)).toEqual({});
    expect(toAddressInput(filled).ad_subject).toHaveLength(20);
    const apiError = new ApiError('Invalid', 422, { fieldErrors: { ad_zip1: '우편번호 오류', ad_x: 'y' } });
    expect(addressErrorsFromApi(apiError)).toEqual({ zip: '우편번호 오류' });
    expect(addressErrorsFromApi(new Error('x'))).toEqual({});
    // 구 6자리 우편번호는 자르지 않는다 — 5자리 검증에 걸려 다시 찾게 한다.
    const legacy = formFromAddress(address(1, { ad_zip1: '123', ad_zip2: '456' }));
    expect(legacy.zip).toBe('123456');
    expect(validateAddressForm(legacy).zip).toBe(t('address.err_zip'));
    expect(addressLines(address(1))).toEqual(['(06307) 서울 강남구 테헤란로 1 (역삼동)', '101호']);
  });
});

describe('AddressesScreen', () => {
  test('lists addresses, makes one default and deletes after confirming', async () => {
    let rows = [address(1, { ad_default: 1 }), address(2)];
    const calls: string[] = [];
    server.use(
      http.get('*/api/v1/shop/addresses', () => envelope(rows)),
      http.patch('*/api/v1/shop/addresses/2', async ({ request }) => {
        calls.push(`PATCH ${JSON.stringify(await request.json())}`);
        rows = [address(2, { ad_default: 1 }), address(1)];
        return envelope(rows[0]);
      }),
      http.delete('*/api/v1/shop/addresses/1', () => {
        calls.push('DELETE 1');
        rows = rows.filter((row) => row.ad_id !== 1);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderScreen(<AddressesScreen navigation={navigation as never} route={route('Addresses', undefined)} />);
    expect(await screen.findByTestId('address-1')).toBeTruthy();
    expect(screen.queryByTestId('address-default-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('address-default-2'));
    await waitFor(() => expect(screen.queryByTestId('address-default-2')).toBeNull());
    await fireEvent.press(screen.getByTestId('address-delete-1'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(screen.queryByTestId('address-1')).toBeNull());
    expect(calls).toEqual(['PATCH {"ad_default":1}', 'DELETE 1']);
    await fireEvent.press(screen.getByTestId('address-edit-2'));
    expect(navigation.navigate).toHaveBeenCalledWith('AddressForm', { adId: 2 });
  });

  test('guests are asked to log in', async () => {
    mockAuth.member = null;
    await renderScreen(<AddressesScreen navigation={navigation as never} route={route('Addresses', undefined)} />);
    expect(screen.getByTestId('addresses-login')).toBeTruthy();
  });

  test('empty list offers adding', async () => {
    server.use(http.get('*/api/v1/shop/addresses', () => envelope([])));
    await renderScreen(<AddressesScreen navigation={navigation as never} route={route('Addresses', undefined)} />);
    expect(await screen.findByTestId('addresses-empty')).toBeTruthy();
    await fireEvent.press(screen.getAllByText(t('address.add'))[0]!);
    expect(navigation.navigate).toHaveBeenCalledWith('AddressForm', undefined);
  });
});

describe('AddressFormScreen', () => {
  test('blocks invalid input, fills from postcode, saves and goes back', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/v1/shop/addresses', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ success: true, data: address(9) }, { status: 201 });
      }),
    );
    const qc = await renderScreen(
      <AddressFormScreen navigation={navigation as never} route={route('AddressForm', undefined)} />,
    );
    await fireEvent.press(screen.getByTestId('address-save'));
    expect(screen.getByText(t('address.err_name'))).toBeTruthy();
    expect(bodies).toEqual([]);
    await fireEvent.press(screen.getByTestId('address-find-zip'));
    expect(navigation.navigate).toHaveBeenCalledWith('Postcode', { target: 'AddressForm' });

    const postcode = { zonecode: '06236', address: '서울 강남구 테헤란로 152', extra: '(역삼동)', jibun: '' };
    await screen.rerender(
      wrap(<AddressFormScreen navigation={navigation as never} route={route('AddressForm', { postcode })} />, qc),
    );
    expect(screen.getByTestId('address-zip').props.value).toBe('06236');
    await fireEvent.changeText(screen.getByTestId('address-name'), '홍길동');
    await fireEvent.changeText(screen.getByTestId('address-hp'), '010-1111-2222');
    await fireEvent.changeText(screen.getByTestId('address-addr2'), '10층');
    await fireEvent.press(screen.getByTestId('address-default'));
    await fireEvent.press(screen.getByTestId('address-save'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(bodies[0]).toMatchObject({
      ad_name: '홍길동',
      ad_hp: '010-1111-2222',
      ad_zip: '06236',
      ad_addr1: '서울 강남구 테헤란로 152',
      ad_addr2: '10층',
      ad_addr3: '(역삼동)',
      ad_default: 1,
    });
  });

  test('edit prefills from the list and shows server field errors', async () => {
    server.use(
      http.get('*/api/v1/shop/addresses', () => envelope([address(3)])),
      http.patch('*/api/v1/shop/addresses/3', () =>
        HttpResponse.json(
          { success: false, message: 'Invalid', errors: { ad_hp: '휴대폰 형식 오류' } },
          { status: 422 },
        ),
      ),
    );
    await renderScreen(
      <AddressFormScreen navigation={navigation as never} route={route('AddressForm', { adId: 3 })} />,
    );
    await waitFor(() => expect(screen.getByTestId('address-name').props.value).toBe('홍길동'));
    await fireEvent.press(screen.getByTestId('address-save'));
    expect(await screen.findByText('휴대폰 형식 오류')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('PostcodeScreen', () => {
  test('hands the chosen address back to the form and shows a retry on script failure', async () => {
    await renderScreen(
      <PostcodeScreen navigation={navigation as never} route={route('Postcode', { target: 'AddressForm' })} />,
    );
    const props = mockWebViewProps.current!;
    const onShouldStart = props.onShouldStartLoadWithRequest as (r: { url: string }) => boolean;
    expect(onShouldStart({ url: 'https://evil.example/' })).toBe(false);
    const onMessage = props.onMessage as (e: { nativeEvent: { data: string } }) => void;
    const data = JSON.stringify({
      type: 'postcode',
      data: { zonecode: '06236', userSelectedType: 'R', roadAddress: '도로 1' },
    });
    await act(async () => onMessage({ nativeEvent: { data } }));
    expect(navigation.navigate).toHaveBeenCalledWith({
      name: 'AddressForm',
      params: { postcode: { zonecode: '06236', address: '도로 1', extra: '', jibun: '' } },
      merge: true,
    });
    await act(async () => onMessage({ nativeEvent: { data: JSON.stringify({ type: 'error' }) } }));
    expect(screen.getByTestId('postcode-failed')).toBeTruthy();
    await fireEvent.press(screen.getByText(t('common.retry')));
    expect(screen.getByTestId('postcode-webview')).toBeTruthy();
  });

  test('checkout target gets the result tagged with its field', async () => {
    await renderScreen(
      <PostcodeScreen
        navigation={navigation as never}
        route={route('Postcode', { target: 'Checkout', field: 'recipient' })}
      />,
    );
    const onMessage = mockWebViewProps.current!.onMessage as (e: { nativeEvent: { data: string } }) => void;
    const data = JSON.stringify({
      type: 'postcode',
      data: { zonecode: '06236', userSelectedType: 'R', roadAddress: '도로 2' },
    });
    await act(async () => onMessage({ nativeEvent: { data } }));
    expect(navigation.navigate).toHaveBeenCalledWith({
      name: 'Checkout',
      params: { postcode: { zonecode: '06236', address: '도로 2', extra: '', jibun: '' }, postcodeField: 'recipient' },
      merge: true,
    });
  });
});

describe('PointsScreen', () => {
  test('balance and signed history', async () => {
    server.use(
      http.get('*/api/v1/shop/points/summary', () => envelope({ balance: 12345, history: [] })),
      http.get('*/api/v1/members/me/points', () =>
        HttpResponse.json({
          success: true,
          data: [
            { po_id: 2, po_content: '쿠폰 구매', po_point: -500, po_use_point: 0, po_datetime: '2026-09-20 10:00:00' },
            { po_id: 1, po_content: '회원가입', po_point: 1000, po_use_point: 500, po_datetime: '2026-09-01 10:00:00' },
          ],
          meta: { current_page: 1, last_page: 1, per_page: 30, total: 2, from: 1, to: 2 },
        }),
      ),
    );
    await renderScreen(<PointsScreen navigation={navigation as never} route={route('Points', undefined)} />);
    expect(await screen.findByText(formatPoint(12345))).toBeTruthy();
    expect(await screen.findByText(formatPoint(-500, true))).toBeTruthy();
    expect(screen.getByText(formatPoint(1000, true))).toBeTruthy();
    expect(screen.getByText('2026.09.20')).toBeTruthy();
  });

  test('helpers and guest prompt', async () => {
    expect(formatPoint(1000, true)).toBe(t('point.amount', { point: '+1,000' }));
    expect(formatPoint(-5, true)).toBe(t('point.amount', { point: '-5' }));
    mockAuth.member = null;
    await renderScreen(<PointsScreen navigation={navigation as never} route={route('Points', undefined)} />);
    await fireEvent.press(screen.getByText(t('auth.login')));
    expect(navigation.navigate).toHaveBeenCalledWith('Login', { returnTo: { name: 'Points', params: undefined } });
  });
});
