/**
 * features/notifications/notificationListener — 수신 기록(서버/로컬 폴백)·탭 처리·중복 제거·정리.
 * dday-app 의 테스트를 dday 라우팅 없는 현재 동작(탭 → 알림함)에 맞춰 재작성했다.
 */
import * as Notifications from 'expo-notifications';
import { createNotification } from '../entities/notification/api';
import { navigate } from '../navigation/navRef';
import {
  setupNotificationListener,
  teardownNotificationListener,
} from '../features/notifications/notificationListener';
import {
  addLocalNotificationForOwner,
  getLocalNotificationStorageOwner,
} from '../features/notifications/localNotificationLog';

jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponse: jest.fn(),
}));
jest.mock('../navigation/navRef', () => ({ navigate: jest.fn() }));
jest.mock('../entities/notification/api', () => ({ createNotification: jest.fn() }));
jest.mock('../features/notifications/localNotificationLog', () => ({
  addLocalNotificationForOwner: jest.fn(async () => undefined),
  getLocalNotificationStorageOwner: jest.fn(() => null),
}));

const mockedLastResponse = Notifications.getLastNotificationResponseAsync as jest.MockedFunction<
  typeof Notifications.getLastNotificationResponseAsync
>;
const mockedReceived = Notifications.addNotificationReceivedListener as jest.MockedFunction<
  typeof Notifications.addNotificationReceivedListener
>;
const mockedResponse = Notifications.addNotificationResponseReceivedListener as jest.MockedFunction<
  typeof Notifications.addNotificationResponseReceivedListener
>;
const mockedNavigate = navigate as jest.MockedFunction<typeof navigate>;
const mockedCreate = createNotification as jest.MockedFunction<typeof createNotification>;
const mockedAddLocal = addLocalNotificationForOwner as jest.MockedFunction<typeof addLocalNotificationForOwner>;
const mockedOwner = getLocalNotificationStorageOwner as jest.MockedFunction<typeof getLocalNotificationStorageOwner>;

function makeNotification(identifier: string, trigger: unknown = { type: 'date' }): Notifications.Notification {
  return {
    date: 1,
    request: {
      identifier,
      content: { title: '새 댓글', body: '본문', data: { notify_days: '3' } },
      trigger,
    },
  } as unknown as Notifications.Notification;
}

function makeResponse(identifier: string): Notifications.NotificationResponse {
  return { actionIdentifier: 'default', notification: makeNotification(identifier) };
}

function receivedHandler(): (n: Notifications.Notification) => void {
  const call = mockedReceived.mock.calls[0];
  if (!call) throw new Error('received listener not registered');
  return call[0] as (n: Notifications.Notification) => void;
}

function responseHandler(): (r: Notifications.NotificationResponse) => void {
  const call = mockedResponse.mock.calls[0];
  if (!call) throw new Error('response listener not registered');
  return call[0] as (r: Notifications.NotificationResponse) => void;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockedOwner.mockReturnValue(null);
  mockedCreate.mockResolvedValue({} as never);
});

afterEach(() => {
  teardownNotificationListener();
  jest.useRealTimers();
});

describe('setup / teardown', () => {
  test('registers both listeners once and removes them on teardown', () => {
    setupNotificationListener();
    setupNotificationListener();
    expect(mockedReceived).toHaveBeenCalledTimes(1);
    expect(mockedResponse).toHaveBeenCalledTimes(1);

    const received = mockedReceived.mock.results[0]!.value as { remove: jest.Mock };
    const response = mockedResponse.mock.results[0]!.value as { remove: jest.Mock };
    teardownNotificationListener();
    expect(received.remove).toHaveBeenCalledTimes(1);
    expect(response.remove).toHaveBeenCalledTimes(1);
  });
});

describe('tap handling', () => {
  test('a cold-start response opens the inbox after the navigation delay', async () => {
    mockedLastResponse.mockResolvedValueOnce(makeResponse('cold-1'));
    setupNotificationListener();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedNavigate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(mockedNavigate).toHaveBeenCalledWith('Notifications');
  });

  test('a handled response is cleared so the next cold start does not replay it (T-P1A-11)', async () => {
    mockedLastResponse.mockResolvedValueOnce(makeResponse('cold-2'));
    setupNotificationListener();
    await Promise.resolve();
    await Promise.resolve();
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  test('a comment push opens the post (server event name)', () => {
    setupNotificationListener();
    const response = makeResponse('route-1');
    (response.notification.request.content as { data: unknown }).data = {
      type: 'comment.created',
      bo_table: 'free',
      wr_id: 12,
    };
    responseHandler()(response);
    jest.advanceTimersByTime(300);
    expect(mockedNavigate).toHaveBeenCalledWith('PostDetail', { board: 'free', wr_id: 12, comment_id: undefined });
  });

  test('the same response id is handled once even if delivered twice', () => {
    setupNotificationListener();
    const handle = responseHandler();
    handle(makeResponse('dup-1'));
    handle(makeResponse('dup-1'));
    jest.advanceTimersByTime(300);
    expect(mockedNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('recording received notifications', () => {
  test('server pushes (trigger.type push) are not recorded again', () => {
    setupNotificationListener();
    receivedHandler()(makeNotification('push-1', { type: 'push' }));
    jest.advanceTimersByTime(1000);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedAddLocal).not.toHaveBeenCalled();
  });

  test('local notifications are queued and sent to the server after the flush delay', async () => {
    setupNotificationListener();
    receivedHandler()(makeNotification('local-1'));
    expect(mockedCreate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(800);
    await Promise.resolve();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const payload = mockedCreate.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(payload).toMatchObject({ nt_type: 'custom', nt_title: '새 댓글', nt_body: '본문' });
    expect(payload.nt_data).toMatchObject({ source: 'local', notify_days: 3 });
    expect(payload).not.toHaveProperty('dday_id');
  });

  test('falls back to the local log when the server call fails', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('offline'));
    setupNotificationListener();
    receivedHandler()(makeNotification('local-2'));
    jest.advanceTimersByTime(800);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockedAddLocal).toHaveBeenCalledTimes(1);
  });

  test('a notification received twice under the same id is recorded once', () => {
    setupNotificationListener();
    const handle = receivedHandler();
    handle(makeNotification('same-id'));
    handle(makeNotification('same-id'));
    jest.advanceTimersByTime(800);
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });

  test('teardown flushes anything still queued', async () => {
    setupNotificationListener();
    receivedHandler()(makeNotification('local-3'));
    teardownNotificationListener();
    await Promise.resolve();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });
});
