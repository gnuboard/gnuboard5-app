import { updateIdFromManifest, updateIdFromResult } from '../features/update/otaUpdateChecker';

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  isEnabled: true,
  manifest: null,
  reloadAsync: jest.fn(),
}));

describe('ota update id extraction', () => {
  test('extracts trimmed update ids from supported manifest locations', () => {
    expect(updateIdFromManifest({ id: ' update-1 ' })).toBe('update-1');
    expect(updateIdFromManifest({ metadata: { updateId: ' update-2 ' } })).toBe('update-2');
    expect(updateIdFromManifest({ extra: { eas: { id: ' update-3 ' } } })).toBe('update-3');
  });

  test('extracts update ids from result manifests and manifest strings', () => {
    expect(updateIdFromResult({ manifest: { id: ' update-4 ' } })).toBe('update-4');
    expect(
      updateIdFromResult({
        manifestString: JSON.stringify({ extra: { eas: { updateId: ' update-5 ' } } }),
      }),
    ).toBe('update-5');
  });

  test('rejects malformed update ids', () => {
    expect(updateIdFromManifest({ id: ' ' })).toBeNull();
    expect(updateIdFromManifest({ id: 'update/1' })).toBeNull();
    expect(updateIdFromManifest({ id: 'update\n1' })).toBeNull();
    expect(updateIdFromManifest({ id: 'x'.repeat(129) })).toBeNull();
    expect(updateIdFromManifest({ metadata: { updateId: 123 } })).toBeNull();
    expect(updateIdFromResult({ manifestString: JSON.stringify({ id: 'update 1' }) })).toBeNull();
    expect(updateIdFromResult({ manifestString: '{not-json' })).toBeNull();
  });
});
