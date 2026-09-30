import {
  normalizeSignupForm,
  validateSignupForm,
  type SignupFormFields,
} from '../features/auth/signup/signupValidation';

const validForm: SignupFormFields = {
  mb_id: 'member_01',
  mb_password: 'Secure1234',
  mb_password_re: 'Secure1234',
  mb_nick: '닉네임',
  mb_name: '홍길동',
  mb_email: 'user@example.com',
  captcha_key: 'Ab12',
};

describe('signupValidation', () => {
  test('trims non-password fields before submit', () => {
    expect(
      normalizeSignupForm({
        ...validForm,
        mb_id: ' member_01 ',
        mb_nick: ' 닉네임 ',
        mb_name: ' 홍길동 ',
        mb_email: ' user@example.com ',
        captcha_key: ' Ab12 ',
        mb_password: ' Secure1234 ',
        mb_password_re: ' Secure1234 ',
      }),
    ).toEqual({
      ...validForm,
      mb_password: ' Secure1234 ',
      mb_password_re: ' Secure1234 ',
    });
  });

  test('accepts a form matching the backend signup policy', () => {
    expect(validateSignupForm(validForm)).toBeNull();
  });

  test('rejects missing captcha before sending signup request', () => {
    expect(validateSignupForm({ ...validForm, captcha_key: '' })).toBe('auth.captcha_required');
  });

  test('matches backend password policy errors', () => {
    expect(
      validateSignupForm({
        ...validForm,
        mb_password: 'abc1234',
        mb_password_re: 'abc1234',
      }),
    ).toBe('auth.password_short');

    expect(
      validateSignupForm({
        ...validForm,
        mb_password: 'abcdefgh',
        mb_password_re: 'abcdefgh',
      }),
    ).toBe('auth.password_letters_numbers');

    expect(
      validateSignupForm({
        ...validForm,
        mb_password: 'abcd1234',
        mb_password_re: 'abcd1234',
      }),
    ).toBe('auth.password_too_common');

    expect(
      validateSignupForm({
        ...validForm,
        mb_id: 'member',
        mb_password: 'member1234',
        mb_password_re: 'member1234',
      }),
    ).toBe('auth.password_contains_id');
  });

  test('rejects invalid identity fields before sending signup request', () => {
    expect(validateSignupForm({ ...validForm, mb_id: 'bad-id' })).toBe('auth.id_invalid');
    expect(validateSignupForm({ ...validForm, mb_nick: 'a' })).toBe('auth.nickname_invalid');
    expect(validateSignupForm({ ...validForm, mb_name: 'a' })).toBe('auth.name_invalid');
    expect(validateSignupForm({ ...validForm, mb_email: 'bad-email' })).toBe('auth.email_invalid');
  });
});
