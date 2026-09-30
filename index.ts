import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';
import { installWebAlert } from './src/shared/web/webAlert';
import { installWebFonts } from './src/shared/web/webFonts';

installWebFonts();
installWebAlert();

// E2E(Maestro) 개발 빌드: 개발용 경고 배너가 하단 탭 바를 덮어 탭 입력을 가로챈다 — 그 실행에서만 끈다.
if (__DEV__ && process.env.EXPO_PUBLIC_E2E === '1') {
  LogBox.ignoreAllLogs(true);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
