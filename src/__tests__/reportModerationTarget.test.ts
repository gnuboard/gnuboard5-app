import { parsePostTarget } from '../features/mypage/admin/reportModel';
import type { ReportItem } from '../entities/report/api';

jest.mock('../entities/session/AuthContext', () => ({
  useAuth: jest.fn(),
}));

function report(overrides: Partial<ReportItem>): ReportItem {
  return {
    report_id: 1,
    target_type: 'post',
    target_key: 'free/1',
    reason: 'spam',
    status: 'open',
    created_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

describe('parsePostTarget', () => {
  test('parses post and comment targets safely', () => {
    expect(parsePostTarget(report({ target_type: 'post', target_key: 'free/12' }))).toEqual({
      board: 'free',
      wr_id: 12,
    });

    expect(
      parsePostTarget(
        report({
          target_type: 'comment',
          target_key: 'free/99',
          target_parent_id: 12,
        }),
      ),
    ).toEqual({
      board: 'free',
      wr_id: 12,
    });
  });

  test('rejects unsafe or unsupported target keys', () => {
    expect(parsePostTarget(report({ target_key: 'free/9007199254740993' }))).toBeNull();
    expect(parsePostTarget(report({ target_key: 'bad board/1' }))).toBeNull();
    expect(parsePostTarget(report({ target_key: 'gallery/1' }))).toEqual({ board: 'gallery', wr_id: 1 });
    expect(parsePostTarget(report({ target_type: 'image', target_key: 'free/1' }))).toBeNull();
  });
});
