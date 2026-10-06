/**
 * features/notifications/tapRouter (PLAN T-P1A-11) — 서버 Notify::emit 이벤트 이름과 예전 이름 모두 표로 검증한다.
 */
import { routeForNotificationData } from '../features/notifications/tapRouter';

describe('routeForNotificationData', () => {
  test.each([
    [
      'comment (plan example)',
      { type: 'comment', bo_table: 'free', wr_id: '12' },
      { name: 'PostDetail', params: { board: 'free', wr_id: 12, comment_id: undefined } },
    ],
    [
      'comment.created from the server',
      { type: 'comment.created', bo_table: 'free', wr_id: 12, link: '/free/12', commenter: 'nick' },
      { name: 'PostDetail', params: { board: 'free', wr_id: 12, comment_id: undefined } },
    ],
    [
      'reply.created with comment_id',
      { type: 'reply.created', bo_table: 'qna', wr_id: '7', comment_id: '9' },
      { name: 'PostDetail', params: { board: 'qna', wr_id: 7, comment_id: 9 } },
    ],
    [
      'a broken comment_id is dropped, not fatal',
      { type: 'comment.created', bo_table: 'free', wr_id: 3, comment_id: 'x' },
      { name: 'PostDetail', params: { board: 'free', wr_id: 3, comment_id: undefined } },
    ],
    [
      'qa.answered from the server',
      { type: 'qa.answered', qa_id: '5', qa_answer_id: '6' },
      { name: 'QaDetail', params: { qa_id: 5 } },
    ],
    [
      'customer_qa_answer (legacy)',
      { type: 'customer_qa_answer', qa_id: 5 },
      { name: 'QaDetail', params: { qa_id: 5 } },
    ],
    ['admin broadcast', { source: 'broadcast' }, { name: 'Notifications' }],
    [
      'order status push',
      { type: 'order', od_id: '2026092412345678', status: '배송' },
      { name: 'OrderDetail', params: { odId: '2026092412345678' } },
    ],
    [
      'order.shipped with a numeric id',
      { type: 'order.shipped', od_id: 2026092412345678 },
      { name: 'OrderDetail', params: { odId: '2026092412345678' } },
    ],
    ['broadcast with a system type', { type: 'system', source: 'broadcast' }, { name: 'Notifications' }],
    [
      'admin new report opens report moderation',
      { type: 'admin.report.created', target_type: 'image' },
      { name: 'ReportModeration' },
    ],
    [
      'admin new order opens the admin order page, not the buyer order screen',
      { type: 'admin.order.placed', od_id: '2026100112345678' },
      { name: 'AdminOrder', params: { odId: '2026100112345678' } },
    ],
  ])('%s', (_label, data, expected) => {
    expect(routeForNotificationData(data)).toEqual(expected);
  });

  test.each([
    ['vaccine.due (allowed, no screen)', { type: 'vaccine.due', baby_id: 1 }],
    ['dday.reminder', { type: 'dday.reminder', dday_id: 2 }],
    ['memo.received', { type: 'memo.received', me_id: 3 }],
    ['comment without a board', { type: 'comment', wr_id: '12' }],
    ['comment with an unsafe board', { type: 'comment', bo_table: '../x', wr_id: 1 }],
    ['qa without an id', { type: 'qa.answered' }],
    ['order without an id', { type: 'order', status: '입금' }],
    ['order with a bad id', { type: 'order', od_id: '../1' }],
    ['local source', { source: 'local' }],
    [
      'a local notification shaped like a comment',
      { type: 'comment.created', bo_table: 'free', wr_id: 1, source: 'local' },
    ],
    ['null', null],
    ['array', [1]],
    ['string', 'comment'],
  ])('%s → null (caller falls back)', (_label, data) => {
    expect(routeForNotificationData(data)).toBeNull();
  });
});
