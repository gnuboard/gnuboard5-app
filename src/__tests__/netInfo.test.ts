import { isOfflineNetworkState } from '../shared/lib/netInfo';

describe('isOfflineNetworkState', () => {
  it('treats a connected and reachable network as online', () => {
    expect(isOfflineNetworkState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('treats a disconnected network as offline', () => {
    expect(isOfflineNetworkState({ isConnected: false, isInternetReachable: true })).toBe(true);
    expect(isOfflineNetworkState({ isConnected: false, isInternetReachable: null })).toBe(true);
  });

  it('treats connected networks without internet reachability as offline', () => {
    expect(isOfflineNetworkState({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('does not show offline while reachability is still unknown', () => {
    expect(isOfflineNetworkState({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOfflineNetworkState({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});
