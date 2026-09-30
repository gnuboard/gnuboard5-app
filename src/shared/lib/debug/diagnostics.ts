import Constants from 'expo-constants';

export const SHOW_DIAGNOSTICS =
  __DEV__ || (Constants.expoConfig?.extra as { showDiagnostics?: boolean } | undefined)?.showDiagnostics === true;
