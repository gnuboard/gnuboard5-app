import { ApiError } from '../shared/api/client';
import { performBulkNotificationAction } from '../features/notifications/queries';

describe('performBulkNotificationAction', () => {
  test('runs local action but rejects on server failures', async () => {
    const error = new ApiError('server down', 500);
    const serverAction = jest.fn(async () => {
      throw error;
    });
    const localAction = jest.fn(async () => undefined);

    await expect(performBulkNotificationAction(serverAction, localAction)).rejects.toBe(error);
    expect(serverAction).toHaveBeenCalledTimes(1);
    expect(localAction).toHaveBeenCalledTimes(1);
  });

  test('uses local fallback for auth-only server failures', async () => {
    const serverAction = jest.fn(async () => {
      throw new ApiError('unauthorized', 401);
    });
    const localAction = jest.fn(async () => undefined);

    await expect(performBulkNotificationAction(serverAction, localAction)).resolves.toBeUndefined();
    expect(serverAction).toHaveBeenCalledTimes(1);
    expect(localAction).toHaveBeenCalledTimes(1);
  });

  test('rejects when the local action fails', async () => {
    const error = new Error('local failed');
    const serverAction = jest.fn(async () => undefined);
    const localAction = jest.fn(async () => {
      throw error;
    });

    await expect(performBulkNotificationAction(serverAction, localAction)).rejects.toBe(error);
  });

  test('reports the server error first when both actions fail', async () => {
    const serverError = new ApiError('server down', 500);
    const localError = new Error('local failed');
    const serverAction = jest.fn(async () => {
      throw serverError;
    });
    const localAction = jest.fn(async () => {
      throw localError;
    });

    await expect(performBulkNotificationAction(serverAction, localAction)).rejects.toBe(serverError);
  });
});
