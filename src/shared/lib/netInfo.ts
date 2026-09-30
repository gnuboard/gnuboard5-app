export interface NetworkReachabilityState {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}

export function isOfflineNetworkState(state: NetworkReachabilityState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}
