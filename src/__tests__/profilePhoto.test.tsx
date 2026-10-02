/**
 * 내 정보 프로필 사진(회원이미지): 바꾸기 → 고른 사진을 올리고 다시 읽기, 취소는 아무것도 안 함, 너무 크면 안내,
 * 올리기 실패 안내, 지우기는 확인 뒤 삭제.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ProfilePhoto, type ProfilePhotoDeps } from '../features/mypage/profile/ProfilePhoto';
import { setLocale, t } from '../shared/i18n';
import { ThemeProvider } from '../shared/ui/theme/ThemeProvider';

const RULES = { size: 50000, width: 60, height: 60 };

async function setup(imageUrl: string | null, deps: Partial<ProfilePhotoDeps> = {}) {
  const full: ProfilePhotoDeps = {
    pick: jest.fn(async () => ({ kind: 'ready' as const, uri: 'file:///cropped.jpg' })),
    upload: jest.fn(async () => 'https://site.test/data/member_image/ab/abc.gif'),
    remove: jest.fn(async () => undefined),
    ...deps,
  };
  const onChanged = jest.fn(async () => undefined);
  await render(
    <ThemeProvider>
      <ProfilePhoto imageUrl={imageUrl} rules={RULES} onChanged={onChanged} deps={full} />
    </ThemeProvider>,
  );
  return { deps: full, onChanged };
}

beforeAll(async () => {
  await setLocale('ko');
});

afterEach(() => jest.restoreAllMocks());

test('사진이 없으면 기본 모양과 바꾸기만 보이고 크기 안내를 보여 준다', async () => {
  await setup(null);
  expect(screen.queryByTestId('profile-photo-image')).toBeNull();
  expect(screen.queryByTestId('profile-photo-remove')).toBeNull();
  expect(screen.getByText(t('profile.photo_hint', { width: 60, height: 60 }))).toBeTruthy();
});

test('바꾸기: 고른 사진을 올리고 내 정보를 다시 읽는다', async () => {
  const { deps, onChanged } = await setup(null);
  await fireEvent.press(screen.getByTestId('profile-photo-change'));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(deps.pick).toHaveBeenCalledWith(RULES);
  expect(deps.upload).toHaveBeenCalledWith('file:///cropped.jpg');
});

test('고르기를 취소하면 올리지 않는다', async () => {
  const { deps, onChanged } = await setup(null, { pick: jest.fn(async () => ({ kind: 'cancelled' as const })) });
  await fireEvent.press(screen.getByTestId('profile-photo-change'));
  await waitFor(() => expect(deps.pick).toHaveBeenCalled());
  expect(deps.upload).not.toHaveBeenCalled();
  expect(onChanged).not.toHaveBeenCalled();
});

test('용량 아래로 못 줄이면 안내하고 올리지 않는다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { deps } = await setup(null, { pick: jest.fn(async () => ({ kind: 'too_large' as const })) });
  await fireEvent.press(screen.getByTestId('profile-photo-change'));
  await waitFor(() =>
    expect(alert).toHaveBeenCalledWith(t('profile.photo_failed'), t('profile.photo_too_large', { kb: 50 })),
  );
  expect(deps.upload).not.toHaveBeenCalled();
});

test('올리기가 실패하면 실패 안내를 띄우고 다시 읽지 않는다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { onChanged } = await setup(null, { upload: jest.fn(async () => Promise.reject(new Error('너무 커요'))) });
  await fireEvent.press(screen.getByTestId('profile-photo-change'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith(t('profile.photo_failed'), '너무 커요'));
  expect(onChanged).not.toHaveBeenCalled();
});

test('지우기: 확인을 누르면 삭제하고 다시 읽는다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const { deps, onChanged } = await setup('https://site.test/data/member_image/ab/abc.gif');
  expect(screen.getByTestId('profile-photo-image')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('profile-photo-remove'));
  expect(deps.remove).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
  await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(deps.remove).toHaveBeenCalled();
});
