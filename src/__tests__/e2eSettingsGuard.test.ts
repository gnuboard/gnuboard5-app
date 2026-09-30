import { assertE2eSettingsOverrideAllowed } from '../../app.config';

describe('assertE2eSettingsOverrideAllowed (T-P1A-09)', () => {
  const override = '{"app_min_version":"9.9.9"}';

  test.each([
    ['local expo start', '', 'development'],
    ['jest / unset NODE_ENV', '', undefined],
    ['development EAS profile', 'development', 'development'],
  ])('allows the override for %s', (_label, profile, nodeEnv) => {
    expect(() => assertE2eSettingsOverrideAllowed(override, profile, nodeEnv)).not.toThrow();
  });

  test.each([
    ['production EAS profile', 'production', undefined],
    ['preview EAS profile', 'preview', 'development'],
    ['expo export / eas update (no profile)', '', 'production'],
    ['development profile producing a release bundle', 'development', 'production'],
  ])('throws for %s', (_label, profile, nodeEnv) => {
    expect(() => assertE2eSettingsOverrideAllowed(override, profile, nodeEnv)).toThrow(
      /only allowed in development builds/,
    );
  });

  test('does nothing when no override is set', () => {
    expect(() => assertE2eSettingsOverrideAllowed('', 'production', 'production')).not.toThrow();
  });
});
