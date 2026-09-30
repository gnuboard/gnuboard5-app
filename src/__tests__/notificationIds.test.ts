import { normalizeNotificationDdayId } from '../entities/notification/notificationIds';

describe('normalizeNotificationDdayId', () => {
  test('accepts positive integer ids and safe local ids', () => {
    expect(normalizeNotificationDdayId(42)).toBe('42');
    expect(normalizeNotificationDdayId('  local-uuid_1  ')).toBe('local-uuid_1');
  });

  test('preserves safe ids up to the shared lookup-id limit', () => {
    expect(normalizeNotificationDdayId('x'.repeat(50))).toBe('x'.repeat(50));
  });

  test('rejects blank, malformed, and non-integer numeric ids', () => {
    expect(normalizeNotificationDdayId(' dday-1<script>alert(1)</script> ')).toBeNull();
    expect(normalizeNotificationDdayId('x'.repeat(81))).toBeNull();
    expect(normalizeNotificationDdayId('***')).toBeNull();
    expect(normalizeNotificationDdayId('   ')).toBeNull();
    expect(normalizeNotificationDdayId(0)).toBeNull();
    expect(normalizeNotificationDdayId(1.5)).toBeNull();
    expect(normalizeNotificationDdayId({ id: 1 })).toBeNull();
  });
});
