/**
 * 회원이미지(프로필 사진) — 관리자 설정(member_media.image)으로 켜짐·레벨·용량·크기를 정하고, 올리기 전에 설정 비율로
 * 가운데를 잘라 설정 크기로 줄인다. 세션 회원은 http(s) 이미지 주소만 받는다. API 는 POST/DELETE /members/me/image.
 */
import { normalizeAuthMember } from '../entities/session/authModel';
import { centerCropRect, deleteMemberImage, memberImageRules, uploadMemberImage } from '../entities/member/media';
import { http, HttpResponse, server } from '../test/msw/server';

jest.mock('../shared/api/deviceIdentity', () => ({
  getDeviceCredentials: jest.fn(async () => ({ id: 'device-1', sig: 'sig-1' })),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const media = { image: { enabled: true, level: 2, size: 50000, width: 60, height: 60 } };

describe('memberImageRules', () => {
  test('follows the admin settings and the member level', () => {
    expect(memberImageRules({ member_media: media }, { mb_level: 2 })).toEqual({ size: 50000, width: 60, height: 60 });
    expect(memberImageRules({ member_media: media }, { mb_level: 1 })).toBeNull();
    expect(
      memberImageRules({ member_media: { image: { ...media.image, enabled: false } } }, { mb_level: 9 }),
    ).toBeNull();
    expect(memberImageRules({}, { mb_level: 9 })).toBeNull();
    expect(memberImageRules(undefined, { mb_level: 9 })).toBeNull();
    expect(memberImageRules({ member_media: media }, null)).toBeNull();
  });
});

describe('centerCropRect', () => {
  test('cuts the middle of the photo to the target aspect ratio', () => {
    expect(centerCropRect(4000, 3000, 60, 60)).toEqual({ originX: 500, originY: 0, width: 3000, height: 3000 });
    expect(centerCropRect(1080, 1920, 60, 60)).toEqual({ originX: 0, originY: 420, width: 1080, height: 1080 });
    expect(centerCropRect(1000, 1000, 120, 60)).toEqual({ originX: 0, originY: 250, width: 1000, height: 500 });
  });
});

describe('session member image fields', () => {
  test('keeps http(s) image urls and drops anything else', () => {
    const member = normalizeAuthMember({
      mb_id: 'u1',
      mb_nick: 'n',
      mb_image_path: 'https://example.test/data/member_image/u1/u1.gif?1',
      mb_icon_path: 'javascript:alert(1)',
    });
    expect(member?.mb_image_path).toBe('https://example.test/data/member_image/u1/u1.gif?1');
    expect(member?.mb_icon_path).toBeUndefined();
  });
});

describe('member image api', () => {
  test('uploads the prepared photo as mb_img and returns the new url', async () => {
    let hasImageField = false;
    server.use(
      http.post('*/members/me/image', async ({ request }) => {
        const form = await request.formData();
        // msw 가 넘기는 것은 표준 FormData(RN 타입 정의에는 has 가 없다).
        hasImageField = (form as unknown as { has(name: string): boolean }).has('mb_img');
        return HttpResponse.json({
          success: true,
          data: { mb_image_path: 'https://example.test/i.gif?2', message: 'ok' },
        });
      }),
    );
    await expect(uploadMemberImage('file:///cache/profile.jpg')).resolves.toBe('https://example.test/i.gif?2');
    expect(hasImageField).toBe(true);
  });

  test('deletes the member image', async () => {
    let called = false;
    server.use(
      http.delete('*/members/me/image', () => {
        called = true;
        return HttpResponse.json({ success: true, data: { mb_image_path: null, message: 'ok' } });
      }),
    );
    await deleteMemberImage();
    expect(called).toBe(true);
  });
});
